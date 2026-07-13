const candidateFields = [
  ['Ethernet.SrcMAC', 'Source MAC'],
  ['MAC', 'Device MAC'],
  ['IP.SrcIP', 'Source IP'],
  ['SrcIP', 'Source IP'],
  ['DeviceIP', 'Device IP'],
  ['Remote', 'Remote address'],
  ['RemoteEndpoint', 'Remote endpoint'],
  ['name', 'User name'],
  ['InDev', 'Incoming interface'],
  ['IP.DstIP', 'Destination IP'],
  ['DstIP', 'Destination IP'],
  ['TCP.DstPort', 'TCP destination port'],
  ['UDP.DstPort', 'UDP destination port'],
  ['Reason', 'Reason'],
  ['reason', 'Reason'],
  ['Type', 'Event type'],
  ['type', 'Event type']
]

export const getEventPathValue = (event, path) =>
  path.split('.').reduce((value, key) => value?.[key], event)

export const getAlertIgnoreCandidates = (item) => {
  const event = item?.Event || {}
  return candidateFields
    .map(([path, label]) => ({
      path,
      label,
      value: getEventPathValue(event, path)
    }))
    .filter(
      ({ value }) =>
        value !== undefined &&
        value !== null &&
        typeof value !== 'object' &&
        String(value).length > 0
    )
}

export const getDefaultAlertIgnoreFields = (candidates) =>
  candidates.length ? [candidates[0].path] : []

const jsonValue = (value) =>
  typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(String(value))

export const buildAlertIgnoreCondition = (item, selectedPaths) => {
  const event = item?.Event || {}
  const expressions = selectedPaths
    .map((path) => ({ path, value: getEventPathValue(event, path) }))
    .filter(({ value }) => value !== undefined && value !== null)
    .map(({ path, value }) => `@.${path}!=${jsonValue(value)}`)

  return expressions.length ? `$[?(${expressions.join(' || ')})]` : ''
}

const eventTopic = (item) =>
  String(item?.Topic || item?.AlertTopic || '')
    .replace(/^alert:/, '')
    .replace(/:+$/, '')

export const findAlertRule = (rules, item) => {
  const ruleId = item?.RuleId
  let index = rules.findIndex((rule) => ruleId && rule.RuleId === ruleId)

  if (index < 0) {
    const topic = eventTopic(item)
    index = rules
      .map((rule, ruleIndex) => ({ rule, ruleIndex }))
      .filter(({ rule }) => topic.startsWith(rule.TopicPrefix || ''))
      .sort(
        (a, b) =>
          (b.rule.TopicPrefix || '').length - (a.rule.TopicPrefix || '').length
      )[0]?.ruleIndex
  }

  return Number.isInteger(index) && index >= 0
    ? { index, rule: rules[index] }
    : null
}

export const alertIgnoreRuleError = (rule) => {
  if (!rule) return 'The alert rule could not be found.'
  if (!(rule.Conditions || []).length) return ''
  if (rule.MatchAnyOne) {
    return 'This rule uses Match Any conditions. Review it in the rule editor before adding an exception.'
  }
  if (rule.InvertRule) {
    return 'This rule already uses inverted conditions. Review it in the rule editor before adding an exception.'
  }
  return ''
}

export const appendAlertIgnoreCondition = (rule, condition) => {
  const conditions = rule.Conditions || []
  if (conditions.some((entry) => entry.JPath === condition)) {
    return { added: false, rule }
  }

  const hadConditions = conditions.length > 0
  return {
    added: true,
    rule: {
      ...rule,
      MatchAnyOne: hadConditions ? rule.MatchAnyOne : false,
      InvertRule: hadConditions ? rule.InvertRule : false,
      Conditions: [...conditions, { JPath: condition }]
    }
  }
}
