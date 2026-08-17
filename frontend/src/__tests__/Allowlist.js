import {
  allowlistPolicyValues,
  hasAllowlistSourceConflict,
  normalizeInternetPolicySelection,
  selectedAllowlistPolicy,
  setAllowlistEnabled,
  setAllowlistPolicy
} from 'utils/allowlist'

describe('named allowlist policy selection', () => {
  test('maps configured names to policy values', () => {
    expect(
      allowlistPolicyValues({ Allowlists: [{ Name: 'iot' }, { Name: 'work' }] })
    ).toEqual(['allowlist:iot', 'allowlist:work'])
  })

  test('selecting an allowlist replaces wan and another allowlist', () => {
    expect(
      normalizeInternetPolicySelection(
        ['wan', 'dns', 'allowlist:iot', 'allowlist:work'],
        ['wan', 'dns', 'allowlist:iot']
      )
    ).toEqual(['dns', 'allowlist:work'])
  })

  test('selecting wan removes a named allowlist', () => {
    expect(
      normalizeInternetPolicySelection(
        ['dns', 'allowlist:iot', 'wan'],
        ['dns', 'allowlist:iot']
      )
    ).toEqual(['dns', 'wan'])
  })

  test('shows the selected allowlist', () => {
    expect(selectedAllowlistPolicy(['dns', 'wan'])).toBe('')
    expect(selectedAllowlistPolicy(['dns', 'allowlist:work'])).toBe(
      'allowlist:work'
    )
  })

  test('enabling an allowlist removes wan', () => {
    expect(setAllowlistEnabled(['dns', 'wan'], true)).toEqual(['dns'])
    expect(setAllowlistEnabled(['dns', 'allowlist:work'], false)).toEqual([
      'dns'
    ])
  })

  test('selecting an allowlist replaces the Internet policy', () => {
    expect(setAllowlistPolicy(['dns', 'wan'], 'allowlist:work')).toEqual([
      'dns',
      'allowlist:work'
    ])
  })

  test('warns when another rule shares an allowlisted source', () => {
    const rules = [
      {
        Interface: 'docker0',
        SrcIP: '172.17.0.0/16',
        RouteDst: '192.168.1.1',
        Policies: ['wan']
      }
    ]

    expect(
      hasAllowlistSourceConflict({
        rules,
        interfaceName: 'docker0',
        source: '172.17.0.0/16',
        policies: ['allowlist:work']
      })
    ).toBe(true)
  })

  test('does not warn for the rule being edited', () => {
    const rule = {
      Interface: 'docker0',
      SrcIP: '172.17.0.0/16',
      Policies: ['allowlist:work']
    }

    expect(
      hasAllowlistSourceConflict({
        rules: [rule],
        currentRule: rule,
        interfaceName: rule.Interface,
        source: rule.SrcIP,
        policies: rule.Policies
      })
    ).toBe(false)
  })

  test('does not warn when neither rule uses a whitelist', () => {
    expect(
      hasAllowlistSourceConflict({
        rules: [
          {
            Interface: 'docker0',
            SrcIP: '172.17.0.0/16',
            Policies: ['dns']
          }
        ],
        interfaceName: 'docker0',
        source: '172.17.0.0/16',
        policies: ['lan']
      })
    ).toBe(false)
  })
})
