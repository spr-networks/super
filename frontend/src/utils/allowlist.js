export const allowlistPolicyValues = (config) =>
  (config?.Allowlists || []).map((item) => `allowlist:${item.Name}`)

export const selectedAllowlistPolicy = (policies = []) =>
  policies.find(
    (policy) => typeof policy === 'string' && policy.startsWith('allowlist:')
  ) || ''

export const setAllowlistEnabled = (policies = [], enabled) => {
  if (enabled) return policies.filter((policy) => policy !== 'wan')
  return policies.filter(
    (policy) => typeof policy !== 'string' || !policy.startsWith('allowlist:')
  )
}

export const setAllowlistPolicy = (policies = [], selected) => {
  const next = policies.filter(
    (policy) =>
      typeof policy === 'string' &&
      policy !== 'wan' &&
      !policy.startsWith('allowlist:')
  )
  if (selected) next.push(selected)
  return next
}

export const normalizeInternetPolicySelection = (next, previous = []) => {
  next = [...new Set((next || []).filter((value) => typeof value === 'string'))]
  const added = next.find((value) => !previous.includes(value))

  if (added?.startsWith('allowlist:')) {
    return next.filter(
      (value) =>
        value !== 'wan' && (!value.startsWith('allowlist:') || value === added)
    )
  }
  if (added === 'wan') {
    return next.filter((value) => !value.startsWith('allowlist:'))
  }

  const selectedAllowlists = next.filter((value) =>
    value.startsWith('allowlist:')
  )
  if (selectedAllowlists.length > 1) {
    const keep = selectedAllowlists[selectedAllowlists.length - 1]
    return next.filter(
      (value) => !value.startsWith('allowlist:') || value === keep
    )
  }
  return next
}

export const hasAllowlistSourceConflict = ({
  rules = [],
  currentRule,
  interfaceName,
  source,
  policies = []
}) =>
  Boolean(interfaceName && source) &&
  rules.some(
    (rule) =>
      rule !== currentRule &&
      rule.Interface === interfaceName &&
      rule.SrcIP === source &&
      Boolean(
        selectedAllowlistPolicy(policies) ||
        selectedAllowlistPolicy(rule.Policies)
      )
  )
