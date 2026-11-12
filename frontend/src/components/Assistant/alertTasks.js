import { array, boolean, enumValue, integer, number, object, string, validateInput } from './operationSchema'

const need = (ok, message) => { if (!ok) throw new Error(message) }
const clone = value => JSON.parse(JSON.stringify(value))
const text = (description) => string({ minLength: 1, maxLength: 256, description })
const operators = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }
const scalar = { anyOf: [string({ maxLength: 512 }), number(), boolean()] }
const condition = object({ path: string({ minLength: 1, maxLength: 160,
  pattern: '^[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*$',
  description: 'Exact case-sensitive event field path from the user or an observed event, e.g. type or IP.SrcIP. Never invent an event field.' }),
  operator: enumValue(Object.keys(operators)), value: scalar }, ['path', 'operator', 'value'])
export { condition as alertConditionSchema }
const actionPatch = object({ notify: boolean(), store: boolean(), title: text(), body: string({ maxLength: 2000 }),
  severity: enumValue(['info', 'warning', 'success', 'error']) })
const edit = object({ operation: enumValue(['add', 'replace', 'remove']), index: integer({ minimum: 0, maximum: 63 }),
  expected: string({ minLength: 1, maxLength: 2000, description: 'Exact existing JPath from the inspected rule, required for replacement/removal.' }),
  condition }, ['operation'])

export const compileAlertCondition = input => {
  validateInput(input, condition)
  need(!input.path.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)), 'Unsupported event field path')
  need(['eq', 'ne'].includes(input.operator) || typeof input.value === 'number', 'Ordered comparisons require a numeric value')
  return { JPath: `$[?(@.${input.path}${operators[input.operator]}${JSON.stringify(input.value)})]` }
}

const createSchema = object({ name: text('New descriptive alert name'), topicPrefix: text('Exact event topic prefix from the user or observed events; prefix matching may include subtopics.'),
  conditions: array(condition, { maxItems: 32 }), match: enumValue(['all', 'any']),
  delivery: enumValue(['notify', 'store', 'both']), enabled: boolean(), invert: boolean(),
  title: text(), body: string({ maxLength: 2000 }), severity: enumValue(['info', 'warning', 'success', 'error'])
}, ['name', 'topicPrefix', 'conditions', 'match', 'delivery'])
const modifySchema = object({ rule: text('Exact current rule Name or RuleId; duplicate names require RuleId.'),
  name: text(), topicPrefix: text(), enabled: boolean(), match: enumValue(['all', 'any']), invert: boolean(),
  conditionEdits: array(edit, { minItems: 1, maxItems: 32 }),
  actionIndex: integer({ minimum: 0, maximum: 63 }), action: actionPatch
}, ['rule'])
const actionChanges = input => Object.fromEntries(Object.entries({ notify: 'SendNotification', store: 'StoreAlert', title: 'MessageTitle', body: 'MessageBody', severity: 'NotificationType' })
  .filter(([key]) => input[key] !== undefined).map(([key, field]) => [field, input[key]]))
const assertRule = rule => {
  need(rule && typeof rule === 'object' && Array.isArray(rule.Conditions) && Array.isArray(rule.Actions), 'Alert conditions/actions are unavailable; inspect the rule before changing it')
  need(rule.Conditions.every(c => c && typeof c.JPath === 'string' && c.JPath.length), 'An existing condition is missing its expression; repair that rule in the alert editor')
}

export const createAlertTasks = baseOperations => {
  const base = new Map(baseOperations.map(operation => [operation.id, operation]))
  if (!['monitor.alerts.add', 'monitor.alerts.update'].every(id => base.get(id)?.kind === 'write')) return []
  const wrap = (id, label, description, schema, operationId, build) => {
    const operation = base.get(operationId)
    return { id, label, description, schema, kind: 'write', task: true, domain: 'tasks', relatedDomains: ['monitor'],
      menus: ['Monitor > Alerts'], sources: ['frontend/src/components/Assistant/alertTasks.js', 'api/code/alerts.go',
        'frontend/src/components/Alerts/AlertTemplates.js', ...(operation.sources || [])],
      snapshot: async (input, context = {}) => {
        validateInput(input, schema)
        const state = clone(await operation.snapshot({}, context))
        need(Array.isArray(state), 'Alert inventory unavailable')
        const compiled = build(input, state)
        validateInput(compiled, operation.schema)
        return { compiled, state }
      },
      project: (_, before, context = {}) => ({ compiled: before.compiled,
        state: operation.project(clone(before.compiled), clone(before.state), context) }),
      redact: value => value && Object.prototype.hasOwnProperty.call(value, 'state') ? value.state : value,
      run: (_, context) => operation.run(clone(context.before.compiled), { ...context,
        before: clone(context.before.state), after: clone(context.after.state) }),
      verify: (_, before, result, context) => operation.verify(clone(before.compiled), clone(before.state), result, context)
    }
  }
  return [
    wrap('tasks.alerts.create', 'Create an alert from event conditions',
      'Prepare a reviewed alert. Use a known exact topic prefix and typed comparisons on actual event fields; code builds JSONPath filters. conditions=[] means every event under that topic and requires match=all. delivery selects notification, storage, or both. Defaults: enabled, not inverted, info severity, title=name. Conditions, scope and delivery must follow user intent; ask for unknown event fields or desired action. Preparation sends no alert change.',
      createSchema, 'monitor.alerts.add', (input, before) => {
        need(!before.some(rule => rule.Name === input.name), 'An alert already has that name; inspect it and modify it or choose a new name')
        need(input.match !== 'any' || input.conditions.length > 0, 'Match-any needs at least one condition')
        need(input.invert !== true || input.conditions.length > 0, 'Invert needs at least one condition: a rule with no conditions fires on every event')
        return { rule: { Name: input.name, TopicPrefix: input.topicPrefix, Disabled: input.enabled === false,
          MatchAnyOne: input.match === 'any', InvertRule: input.invert === true,
          Conditions: input.conditions.map(compileAlertCondition), Actions: [{
            SendNotification: input.delivery !== 'store', StoreAlert: input.delivery !== 'notify',
            MessageTitle: input.title || input.name, NotificationType: input.severity || 'info', GrabEvent: true,
            ...(input.body !== undefined ? { MessageBody: input.body } : {})
          }] } }
      }),
    wrap('tasks.alerts.modify', 'Correct or change one existing alert rule',
      'Prepare a granular reviewed change by exact rule name or RuleId. Omitted fields, predicates and action fields are preserved. conditionEdits add/replace/remove conditions; replacement/removal requires original index and exact expected JPath from a read. Indexes refer to the original list. Use actionIndex when several actions exist; action changes only supplied notification/storage/title/body/severity fields. Matching any/all and inversion stay unchanged unless requested. No arbitrary expression source is accepted; inspect unclear or malformed rules and ask what should change.',
      modifySchema, 'monitor.alerts.update', (input, before) => {
        const matches = before.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.Name === input.rule || rule.RuleId === input.rule)
        if (!matches.length) matches.push(...before.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.Actions?.[0]?.MessageTitle === input.rule))
        need(matches.length === 1, 'Choose one exact alert name, title or RuleId; the selected identity is missing or ambiguous')
        const { rule, index } = matches[0]
        assertRule(rule)
        const changes = {}
        for (const [field, key] of [['Name', 'name'], ['TopicPrefix', 'topicPrefix']]) if (input[key] !== undefined) changes[field] = input[key]
        if (input.name !== undefined) need(!before.some((r, i) => i !== index && r.Name === input.name), 'Another alert already has the requested name')
        if (input.enabled !== undefined) changes.Disabled = !input.enabled
        if (input.match !== undefined) changes.MatchAnyOne = input.match === 'any'
        if (input.invert !== undefined) changes.InvertRule = input.invert
        if (input.conditionEdits) {
          const replacements = new Map(), removals = new Set(), additions = []
          for (const entry of input.conditionEdits) {
            if (entry.operation === 'add') {
              need(entry.condition && entry.index === undefined && entry.expected === undefined, 'Adding a condition requires only its new comparison')
              additions.push(compileAlertCondition(entry.condition)); continue
            }
            need(Number.isInteger(entry.index) && entry.expected !== undefined, 'Read the original condition index and exact expression before replacing or removing it')
            need(rule.Conditions[entry.index]?.JPath === entry.expected, 'The selected condition changed or does not match; inspect it again')
            need(!replacements.has(entry.index) && !removals.has(entry.index), 'A condition cannot be edited twice in one change')
            if (entry.operation === 'remove') { need(!entry.condition, 'Removing a condition does not take a new comparison'); removals.add(entry.index) }
            else { need(entry.condition, 'Replacement comparison is missing'); replacements.set(entry.index, compileAlertCondition(entry.condition)) }
          }
          changes.Conditions = rule.Conditions.flatMap((c, i) => removals.has(i) ? [] : [replacements.get(i) || clone(c)]).concat(additions)
        }
        const resulting = { ...rule, ...changes }
        need(!resulting.MatchAnyOne || resulting.Conditions.length > 0, 'Removing every condition from match-any would never match; choose the intended match mode')
        need(!resulting.InvertRule || resulting.Conditions.length > 0, 'An inverted rule needs at least one condition: with none it fires on every event')
        const compiled = { index, changes }
        if (input.action) {
          const fields = actionChanges(input.action)
          need(Object.keys(fields).length > 0, 'Choose which action field should change')
          const actionIndex = input.actionIndex === undefined && rule.Actions.length === 1 ? 0 : input.actionIndex
          need(Number.isInteger(actionIndex) && rule.Actions[actionIndex], 'Choose the action index from the inspected alert when several actions exist')
          compiled.actionIndex = actionIndex; compiled.actionChanges = fields
        } else need(input.actionIndex === undefined, 'An action index requires an action change')
        need(Object.keys(changes).length > 0 || compiled.actionChanges, 'Specify the alert setting or condition that should change')
        return compiled
      })
  ]
}
