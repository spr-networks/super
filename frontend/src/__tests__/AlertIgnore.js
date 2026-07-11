import {
  alertIgnoreRuleError,
  appendAlertIgnoreCondition,
  buildAlertIgnoreCondition,
  findAlertRule,
  getAlertIgnoreCandidates,
  getDefaultAlertIgnoreFields
} from 'components/Alerts/AlertIgnoreUtil'
import { alertsAPI } from 'api'

const item = {
  RuleId: 'private-rule',
  Topic: 'nft:drop:private',
  Event: {
    Ethernet: { SrcMAC: 'aa:bb:cc:dd:ee:ff' },
    IP: { SrcIP: '192.168.2.10', DstIP: '10.0.0.8' },
    TCP: { DstPort: 443 }
  }
}

test('offers stable source identity before narrower event details', () => {
  const candidates = getAlertIgnoreCandidates(item)
  expect(candidates.map(({ path }) => path)).toEqual([
    'Ethernet.SrcMAC',
    'IP.SrcIP',
    'IP.DstIP',
    'TCP.DstPort'
  ])
  expect(getDefaultAlertIgnoreFields(candidates)).toEqual([
    'Ethernet.SrcMAC'
  ])
})

test('builds a negative match-all exception with escaped values', () => {
  expect(
    buildAlertIgnoreCondition(item, ['Ethernet.SrcMAC', 'IP.DstIP'])
  ).toBe(
    '$[?(@.Ethernet.SrcMAC!="aa:bb:cc:dd:ee:ff" || @.IP.DstIP!="10.0.0.8")]'
  )
})

test('finds the exact rule id before falling back to the longest topic prefix', () => {
  const rules = [
    { RuleId: 'generic', TopicPrefix: 'nft:' },
    { RuleId: 'private-rule', TopicPrefix: 'other:' },
    { RuleId: 'topic', TopicPrefix: 'nft:drop:private' }
  ]
  expect(findAlertRule(rules, item).index).toBe(1)
  expect(findAlertRule(rules, { Topic: item.Topic }).index).toBe(2)
})

test('appends an ignore condition without changing normal inclusion logic', () => {
  const rule = {
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [{ JPath: '$[?(@.Action=="blocked")]' }]
  }
  const condition = buildAlertIgnoreCondition(item, ['IP.SrcIP'])
  const result = appendAlertIgnoreCondition(rule, condition)

  expect(result.added).toBe(true)
  expect(result.rule.Conditions).toEqual([
    { JPath: '$[?(@.Action=="blocked")]' },
    { JPath: '$[?(@.IP.SrcIP!="192.168.2.10")]' }
  ])
  expect(result.rule.MatchAnyOne).toBe(false)
  expect(result.rule.InvertRule).toBe(false)
})

test('normalizes condition flags only when the rule had no conditions', () => {
  const result = appendAlertIgnoreCondition(
    { MatchAnyOne: true, InvertRule: true, Conditions: [] },
    '$[?(@.MAC!="aa")]'
  )
  expect(result.rule.MatchAnyOne).toBe(false)
  expect(result.rule.InvertRule).toBe(false)
  expect(alertIgnoreRuleError(result.rule)).toBe('')
})

test('does not automatically rewrite advanced condition logic', () => {
  expect(
    alertIgnoreRuleError({ Conditions: [{}], MatchAnyOne: true })
  ).toContain('Match Any')
  expect(
    alertIgnoreRuleError({ Conditions: [{}], InvertRule: true })
  ).toContain('inverted')
})

test('persists an exception through the alert rule API', async () => {
  const rules = await alertsAPI.list()
  const match = findAlertRule(rules, item)
  const original = match.rule
  const condition = buildAlertIgnoreCondition(item, ['Ethernet.SrcMAC'])
  const updated = appendAlertIgnoreCondition(original, condition).rule

  try {
    await alertsAPI.update(match.index, updated)
    const refreshed = await alertsAPI.list()
    expect(refreshed[match.index].Conditions).toContainEqual({ JPath: condition })
  } finally {
    await alertsAPI.update(match.index, original)
  }
})
