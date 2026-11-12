import { dbAPI, getApiURL } from 'api'
import { array, enumValue, integer, object, string, validateInput } from './operationSchema'
import { compileAlertCondition, alertConditionSchema } from './alertTasks'

const need = (ok, message) => { if (!ok) throw new Error(message) }
const timestamp = () => string({ minLength: 20, maxLength: 40, description: 'ISO 8601 timestamp including Z or an explicit timezone offset.' })
const schema = object({ bucket: string({ minLength: 1, maxLength: 256, description: 'Exact existing event bucket, discovered from monitor.events.buckets. Alert storage and raw event topics are separate buckets.' }),
  lastMinutes: integer({ minimum: 1, maximum: 10080 }), from: timestamp(), to: timestamp(),
  filters: array(alertConditionSchema, { maxItems: 16 }), match: enumValue(['all', 'any']),
  limit: integer({ minimum: 1, maximum: 100 }), mode: enumValue(['preview', 'read'])
}, ['bucket', 'filters', 'match', 'mode'])
const iso = value => {
  need(typeof value === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'Use a valid timestamp with an explicit timezone')
  return new Date(value).toISOString()
}
export const compileEventQuery = (input, now = Date.now()) => {
  validateInput(input, schema)
  need(!/[/?#]/.test(input.bucket), 'Choose an exact existing bucket')
  const relative = input.lastMinutes !== undefined
  need(relative ? input.from === undefined && input.to === undefined : input.from !== undefined && input.to !== undefined,
    'Choose lastMinutes or both from and to; do not mix or omit the time window')
  const from = relative ? new Date(now - input.lastMinutes * 60000).toISOString() : iso(input.from)
  const to = relative ? new Date(now).toISOString() : iso(input.to)
  need(Date.parse(from) < Date.parse(to), 'The query start must precede its end')
  need(input.match !== 'any' || input.filters.length > 0, 'Match-any requires at least one filter')
  const predicates = input.filters.map(c => compileAlertCondition(c).JPath.slice(4, -2))
  return { bucket: input.bucket, from, to, filter: predicates.length ? `$[?(${predicates.join(input.match === 'all' ? ' && ' : ' || ')})]` : '',
    limit: input.limit || 50, timeReference: relative ? 'browser clock' : 'explicit timestamps', endExclusive: true }
}

export const createEventQueryTask = baseOperations => {
  const query = baseOperations.find(op => op.id === 'monitor.events.query' && op.kind === 'read')
  if (!query) return []
  return [{ id: 'tasks.events.query', kind: 'read', task: true, domain: 'tasks', relatedDomains: ['monitor'],
    label: 'Build or run a bounded event-log query', schema,
    description: 'Generate a query preview or read matching stored events. Discover the exact bucket and field paths from current records first; never invent event names or infer a historical IP from a device name. Typed comparisons compile to JSONPath. Supply a relative minute window or explicit zoned start/end. User asks for syntax only: mode preview. User asks to inspect records: mode read. A returned page is not a total event count or proof of continuous collection. This never creates or changes an alert rule.',
    menus: ['Monitor > Events', 'Monitor > Alerts'], sources: ['frontend/src/components/Assistant/eventQueryTask.js', 'db/code/boltapi.go', ...(query.sources || [])],
    run: async input => {
      const origin = getApiURL(), plan = compileEventQuery(input)
      const buckets = await dbAPI.buckets()
      need(Array.isArray(buckets) && buckets.includes(plan.bucket), 'Choose an exact current event bucket; do not invent one')
      need(origin === getApiURL(), 'The selected router changed during query preparation')
      if (input.mode === 'preview') return { plan, queryExecuted: false, applied: false,
        note: 'Query prepared for the Events filter. No event query ran and no alert rule was changed.' }
      const page = await query.run({ bucket: plan.bucket, num: plan.limit + 1, min: plan.from, max: plan.to,
        ...(plan.filter ? { filter: plan.filter } : {}) })
      need(origin === getApiURL(), 'The selected router changed during the query')
      const start = Date.parse(plan.from), end = Date.parse(plan.to)
      const inRange = page.rows.filter(row => Number.isFinite(Date.parse(row.time)) && Date.parse(row.time) >= start && Date.parse(row.time) < end)
      const missingTime = page.rows.filter(row => !Number.isFinite(Date.parse(row.time))).length
      const mayHaveMore = page.mayHaveMore || inRange.length > plan.limit
      return { plan, queryExecuted: true, applied: false, rows: inRange.slice(0, plan.limit), pageCount: Math.min(inRange.length, plan.limit),
        mayHaveMore, incomplete: mayHaveMore || missingTime > 0,
        rowsOutsideWindow: page.rows.length - inRange.length - missingTime, rowsWithoutValidTime: missingTime,
        countScope: 'Matching records in this returned page only; not a count of every matching event.',
        coverage: 'Storage, retention and collection continuity are not established by a successful query. No matches does not prove no events occurred.',
        bucketStats: page.bucketStats }
    }
  }]
}
