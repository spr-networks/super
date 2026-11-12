import { getApiURL, withApiRouteGuard } from 'api'
import network from './operations/network'
import firewallDnsDevices from './operations/firewallDnsDevices'
import monitorSystem from './operations/monitorSystem'
import { createTaskOperations } from './taskOperations'
import { createPriorityTasks } from './priorityTasks'
import { createEventQueryTask } from './eventQueryTask'
import { createFamilyDnsTask } from './familyDnsTask'
import { createAlertTasks } from './alertTasks'
import { createObservationOperations } from './observationOperations'
import { createStatusTasks } from './statusTasks'
import { taskConversationOperations, knowledgeOperations } from './taskRuntime'
import { secureTaskOperations, secureApplyOperation, beginSecureTask } from './secureTaskWorkflows'
import { object, string, integer, array, validateInput } from './operationSchema'

const baseOperations = [...network, ...firewallDnsDevices, ...monitorSystem]
const observationOperations = createObservationOperations(baseOperations)
export const UI_OPERATIONS = [...createStatusTasks([...baseOperations, ...observationOperations]), ...createTaskOperations(baseOperations), ...createPriorityTasks(baseOperations), ...observationOperations, ...createAlertTasks(baseOperations), createFamilyDnsTask(), ...createEventQueryTask(baseOperations),
  ...secureTaskOperations.filter(spec => baseOperations.some(base => base.id === spec.requiredOperation)), ...taskConversationOperations, ...knowledgeOperations, secureApplyOperation, ...baseOperations]
const operations = new Map()
for (const spec of UI_OPERATIONS) {
  if (operations.has(spec.id)) throw new Error(`Duplicate assistant operation: ${spec.id}`)
  if (!spec.schema || !['read', 'write', 'ui'].includes(spec.kind)) throw new Error(`Invalid assistant operation: ${spec.id}`)
  if (spec.kind !== 'ui' && typeof spec.run !== 'function') throw new Error(`Operation has no implementation: ${spec.id}`)
  if (spec.kind === 'write' && (typeof spec.snapshot !== 'function' || typeof spec.project !== 'function')) throw new Error(`Write has no review: ${spec.id}`)
  if (spec.kind === 'ui' && !/^(?:\/admin\/[a-zA-Z0-9/_:?.=&%-]+|\/auth\/validate)$/.test(spec.route)) throw new Error(`Invalid UI route: ${spec.id}`)
  operations.set(spec.id, spec)
}

const prepared = new Map()
const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value))
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const router = () => typeof getApiURL === 'function' ? getApiURL() : null
const secretKey = /^(?:password|guest_?password|passwd|psk|pskentry|passphrase|token|login_?token|access_?token|refresh_?token|private_?key|preshared_?key|secret|client_?secret|api_?key|authorization|authdata|credential|credentials|tls_?key|otp|code)$/i

export const redactOperationData = (value, depth = 0) => {
  if (depth > 20) return '[nested data omitted]'
  if (Array.isArray(value)) return value.map((item) => redactOperationData(item, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? '[redacted]' : redactOperationData(item, depth + 1)]))
  if (typeof value === 'string') return value
    .replace(/((?:Bearer|Basic)\s+)[A-Za-z0-9._~+\/=-]+/gi, '$1[redacted]')
    .replace(/([a-z]+:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/((?:password|psk|secret|token|api_key|jwt)\s*[=:]\s*)[^\s,;&"']+/gi, '$1[redacted]')
    .replace(/([?&](?:token|key|secret|password)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted private key]')
  return value
}
const publicData = (spec, data) => redactOperationData(spec.redact ? spec.redact(clone(data)) : clone(data))

export const boundedOperationData = (value, maxChars = 18000) => {
  const text = JSON.stringify(value)
  if (text.length <= maxChars) return value
  if (Array.isArray(value)) {
    const items = []
    for (const item of value) {
      if (JSON.stringify([...items, item]).length > maxChars - 200) break
      items.push(item)
    }
    return { items, truncated: true, total: value.length, returned: items.length, instruction: 'Use a narrower filter or a paginated read; omitted entries are not absent.' }
  }
  return { truncated: true, characters: text.length, preview: text.slice(0, maxChars - 300), instruction: 'This is an incomplete preview. Request a narrower read before drawing conclusions or changing state.' }
}

const inDomain = (spec, domain) => spec.domain === domain || spec.relatedDomains?.includes(domain)
export const operationDomains = () => [...new Set(UI_OPERATIONS.map((spec) => spec.domain))].map((domain) => ({ domain, operations: UI_OPERATIONS.filter((spec) => inDomain(spec, domain)).length }))
export const TASK_MODE_REVIEWED_OPERATIONS = new Set([
  'firewall.port_forward.delete', 'firewall.port_forward.update',
  'network.vpn.peer.remove', 'network.vpn.endpoints.change',
  'network.pfw.route.add', 'network.pfw.route.remove', 'dns.dyndns.update',
  'network.wifi.scan', 'network.wifi.ssid.set', 'network.wifi.radio.disable', 'network.wifi.guest.disable',
  'network.dhcp.lease.set', 'network.dhcp.range.change',
  'network.link.wifi.open', 'network.link.wifi.profile.remove',
  'network.link.downlink.address.add', 'network.link.api.disable',
  'network.wan.monitoring.set', 'network.wan.speed.run',
  'network.mesh.ssid.sync', 'network.mesh.otp.sync', 'network.mesh.leaf.remove', 'network.mesh.jumbo.set'
])
export const availableInTaskMode = spec => Boolean(spec.task || spec.kind === 'read' || spec.kind === 'ui' || TASK_MODE_REVIEWED_OPERATIONS.has(spec.id))

const searchStopWords = new Set('a an the and or of to for from on in at by with as about into is are was were be been being has have had do does did can could would should will may i me my mine we our us you your it its this that these those there please hey hi thanks thank help want need like just only also then now today currently current existing exact selected spr router settings configuration'.split(' '))
const searchAliases = new Map([
  ['wifi', 'wireless', 'wlan'], ['vpn', 'wireguard'], ['ddns', 'dyndns', 'dynamicdns'],
  ['container', 'docker'], ['internet', 'wan'], ['policy', 'policies', 'permission', 'permissions'],
  ['family', 'parental', 'child', 'children', 'kid', 'kids'], ['guest', 'visitor'],
  ['notification', 'notify', 'notifications', 'notifies'], ['auth', 'authentication', 'login', 'logins'],
  ['modify', 'change', 'correct', 'edit', 'update'], ['remove', 'delete', 'forget'],
  ['create', 'add'], ['inspect', 'read', 'show', 'list'], ['traffic', 'packet', 'packets'],
  ['block', 'blocked', 'blocking'], ['allow', 'allowed', 'allowing'], ['rename', 'renaming'],
  ['route', 'routing'], ['query', 'queries'], ['address', 'addresses'], ['ad', 'ads', 'advertisement']
].flatMap(words => words.map(word => [word, words[0]])))
const searchWords = value => [...new Set(String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/)
  .filter(word => word && !searchStopWords.has(word) && !/^\d+$/.test(word))
  .map(word => searchAliases.get(word) || (word.length > 4 && /s$/.test(word) && !/(ss|us)$/.test(word) ? word.slice(0, -1) : word))
  .map(word => searchAliases.get(word) || word))]
const searchSchemaText = schema => {
  if (!schema || typeof schema !== 'object') return ''
  return [schema.description || '', ...(schema.enum || []).filter(value => typeof value === 'string'),
    ...Object.entries(schema.properties || {}).flatMap(([key, value]) => [key, searchSchemaText(value)]),
    searchSchemaText(schema.items), ...(schema.anyOf || []).map(searchSchemaText), ...(schema.oneOf || []).map(searchSchemaText)].join(' ')
}
const searchIndex = UI_OPERATIONS.map(spec => {
  const fields = [spec.id, spec.label, spec.description, (spec.menus || []).join(' '), searchSchemaText(spec.schema)].map(value => new Set(searchWords(value)))
  return { spec, fields, words: new Set(fields.flatMap(field => [...field])) }
})
const searchFrequency = new Map()
for (const item of searchIndex) for (const word of item.words) searchFrequency.set(word, (searchFrequency.get(word) || 0) + 1)
const normalizedSearchPhrase = value => searchWords(value).join(' ')
const searchScore = (item, query, phrase) => {
  const exact = phrase && (phrase === item.spec.id.toLowerCase() || normalizedSearchPhrase(phrase) === normalizedSearchPhrase(item.spec.label))
  let score = exact ? 10000 : 0, matched = 0
  for (const term of query) {
    if (!item.words.has(term)) continue
    matched += 1
    const weight = Math.log(1 + searchIndex.length / (1 + searchFrequency.get(term)))
    score += weight * Math.max(...item.fields.map((field, index) => field.has(term) ? [7, 6, 2, 3, 1][index] : 0))
  }
  if (matched) {
    score *= 1 + matched / Math.max(1, query.length)
    if (item.spec.task) score *= 1.12
  }
  return score
}

const rankedOperations = (search, { taskMode = false, domain, ids } = {}) => {
  const phrase = String(search || '').trim().toLowerCase(), words = searchWords(phrase)
  const query = words.filter(word => searchFrequency.has(word))
  return searchIndex.filter(({ spec }) => !spec.internal && (!taskMode || availableInTaskMode(spec)) &&
    (!domain || inDomain(spec, domain)) && (!ids || ids.includes(spec.id)))
    .map(item => ({ spec: item.spec, score: phrase ? searchScore(item, query, phrase) : 0 }))
    .filter(item => !phrase || item.score > 0)
    .sort((a, b) => b.score - a.score || a.spec.id.localeCompare(b.spec.id))
}
const operationDescription = ({ id, domain, kind, label, description, schema, menus, route, instructions }) =>
  ({ id, domain, kind, label, description, inputSchema: schema, menus, route, instructions })

export const INITIAL_TOOL_RETRIEVAL_LIMITS = Object.freeze({ limit: 6, maxChars: 10000 })
export const relevantUIOperations = (userText, { taskMode = false, exclude = [], limit = INITIAL_TOOL_RETRIEVAL_LIMITS.limit, maxChars = INITIAL_TOOL_RETRIEVAL_LIMITS.maxChars } = {}) => {
  if (!String(userText || '').trim()) return []
  const ranked = rankedOperations(userText, { taskMode })
  const result = [], omitted = new Set(exclude)
  let characters = 0
  for (const { spec, score } of ranked.slice(0, Math.min(INITIAL_TOOL_RETRIEVAL_LIMITS.limit, limit))) {
    if (omitted.has(spec.id) || score < ranked[0].score * .35) continue
    const item = operationDescription(spec), size = JSON.stringify(item).length
    if (characters + size > Math.min(INITIAL_TOOL_RETRIEVAL_LIMITS.maxChars, maxChars)) continue
    result.push(item); characters += size
  }
  return result
}

export const describeUIOperations = (input = {}, { taskMode = false } = {}) => {
  validateInput(input, object({ domain: string(), search: string(), ids: array(string()), cursor: integer({ minimum: 0 }), limit: integer({ minimum: 1, maximum: 20 }) }))
  const domains = operationDomains(), requestedDomain = input.domain?.trim().toLowerCase()
  const domain = domains.some(item => item.domain === requestedDomain) ? requestedDomain : undefined
  let matches = rankedOperations(input.search, { taskMode, domain, ids: input.ids }), domainFallback = Boolean(requestedDomain && !domain)
  if (!matches.length && domain && input.search && !input.ids) {
    matches = rankedOperations(input.search, { taskMode }); domainFallback = matches.length > 0
  }
  const offset = input.cursor || 0
  const limit = input.limit || 8
  return { domains, total: matches.length, nextCursor: offset + limit < matches.length ? offset + limit : null,
    ...(domainFallback ? { domainFallback: { requested: requestedDomain, searched: 'all available domains' } } : {}),
    operations: matches.slice(offset, offset + limit).map(({ spec }) => operationDescription(spec)) }
}

export const getUIOperation = (id, kind) => {
  const spec = operations.get(id)
  if (!spec || (kind && spec.kind !== kind)) throw new Error(`Unsupported ${kind || 'UI'} operation: ${id}`)
  return spec
}
const checked = (id, input, kind) => {
  const spec = getUIOperation(id, kind)
  validateInput(input, spec.schema)
  return spec
}

export const readUIOperation = async (id, input = {}, context = {}) => {
  const spec = checked(id, input, 'read')
  let timer
  const result = await Promise.race([
    Promise.resolve().then(() => spec.run(clone(input), context)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out reading ${spec.label}; current state is unknown.`)), 15000) })
  ]).finally(() => clearTimeout(timer))
  return { operation: id, observedAt: new Date().toISOString(), data: boundedOperationData(publicData(spec, result)) }
}

export const uiOperationHandoff = (id, input = {}) => {
  const spec = checked(id, input, 'ui')
  if (spec.managedWorkflow) return beginSecureTask(id, input)
  return { operation: id, label: spec.label, route: spec.route, instructions: spec.instructions || spec.description, input: publicData(spec, input), applied: false }
}

export const prepareUIOperation = async (proposal, context = {}) => {
  validateInput(proposal, object({ operationId: string(), input: object({}, [], { additionalProperties: true }), reason: string({ maxLength: 512 }) }, ['operationId', 'input']))
  const { operationId, input } = proposal
  const spec = checked(operationId, input, 'write')
  const origin = router()
  const before = clone(await spec.snapshot(clone(input), context))
  const after = clone(await spec.project(clone(input), clone(before), context))
  if (origin !== router()) throw new Error('The selected router changed while preparing the review. Try again.')
  if (spec.noChangeSummary && equal(before, after)) return {
    proposalType: 'ui_operation', operationId, noChange: true, applied: false,
    label: spec.label, summary: typeof spec.noChangeSummary === 'function' ? spec.noChangeSummary(before) : spec.noChangeSummary,
    observedAt: new Date().toISOString(), before: publicData(spec, before), after: publicData(spec, after)
  }
  const reviewId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const review = { proposalType: 'ui_operation', operation: 'update', operationId, input: clone(input), reason: proposal.reason || 'Requested in chat', label: spec.label, reviewId,
    before: publicData(spec, before), after: publicData(spec, after) }
  if (prepared.size >= 32) prepared.delete(prepared.keys().next().value)
  prepared.set(reviewId, { review: clone(review), before, after, origin, context, applying: false })
  return review
}

export const discardUIOperation = (proposal) => prepared.delete(proposal?.reviewId)
export const applyUIOperation = async (proposal, context = {}) => {
  const state = prepared.get(proposal?.reviewId)
  if (!state || !equal(proposal, state.review)) throw new Error('This operation needs a fresh, unchanged review before it can be applied.')
  if (state.applying) throw new Error('This operation is already being applied.')
  if (state.origin !== router()) throw new Error('The selected router changed after review. Prepare the operation again.')
  const spec = checked(proposal.operationId, proposal.input, 'write')
  state.applying = true
  try {
    const operationContext = { ...state.context, ...context }
    const current = clone(await spec.snapshot(clone(proposal.input), operationContext))
    if (state.origin !== router()) throw new Error('The selected router changed while checking the review. Prepare the operation again.')
    if (!equal(current, state.before)) throw new Error('The relevant state changed after review. Prepare the operation again.')
    prepared.delete(proposal.reviewId)
    let result
    try {
      const dispatch = () => spec.run(clone(proposal.input), { ...operationContext, before: clone(state.before), after: clone(state.after) })
      result = typeof withApiRouteGuard === 'function' ? await withApiRouteGuard(state.origin, dispatch) : await dispatch()
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error?.message || error))
      failure.operationMayHaveApplied = true
      throw failure
    }
    let verification
    try {
      if (state.origin !== router()) throw new Error('The selected router changed; verify the original router after reconnecting.')
      verification = spec.verify
        ? await spec.verify(clone(proposal.input), clone(state.before), result, operationContext)
        : { verified: null, summary: 'The API returned successfully. Inspect the refreshed evidence to confirm the intended effect.', data: await spec.snapshot(clone(proposal.input), operationContext) }
    } catch (error) {
      verification = { verified: null, summary: `The request returned successfully, but verification failed: ${error.message}` }
    }
    return { ...state.review, result: boundedOperationData(publicData(spec, result)), verification: boundedOperationData(publicData(spec, verification)) }
  } finally {
    state.applying = false
  }
}
