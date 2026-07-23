import { deviceAPI, firewallAPI } from 'api'

const RULE_TYPES = {
  endpoint: {
    label: 'service endpoint',
    configKey: 'Endpoints',
    fields: [
      'RuleName',
      'Description',
      'Disabled',
      'IP',
      'Domain',
      'Protocol',
      'Port',
      'Tags'
    ],
    required: ['IP', 'Protocol'],
    add: (rule) => firewallAPI.addEndpoint(rule),
    remove: (rule) => firewallAPI.deleteEndpoint(rule)
  },
  port_forward: {
    label: 'port forwarding rule',
    configKey: 'ForwardingRules',
    fields: [
      'RuleName',
      'Description',
      'Disabled',
      'Protocol',
      'SrcIP',
      'SrcPort',
      'DstIP',
      'DstPort'
    ],
    required: ['Protocol', 'SrcIP', 'DstIP'],
    add: (rule) => firewallAPI.addForward(rule),
    remove: (rule) => firewallAPI.deleteForward(rule)
  },
  inbound_block: {
    label: 'inbound block rule',
    configKey: 'BlockRules',
    fields: [
      'RuleName',
      'Description',
      'Disabled',
      'SrcIP',
      'DstIP',
      'Protocol'
    ],
    required: ['SrcIP', 'DstIP', 'Protocol'],
    add: (rule) => firewallAPI.addBlock(rule),
    remove: (rule) => firewallAPI.deleteBlock(rule)
  },
  forward_block: {
    label: 'forwarding block rule',
    configKey: 'ForwardingBlockRules',
    fields: [
      'RuleName',
      'Description',
      'Disabled',
      'SrcIP',
      'DstIP',
      'DstPort',
      'Protocol'
    ],
    required: ['SrcIP', 'DstIP', 'Protocol'],
    add: (rule) => firewallAPI.addForwardBlock(rule),
    remove: (rule) => firewallAPI.deleteForwardBlock(rule)
  },
  outbound_block: {
    label: 'SPR outbound block rule',
    configKey: 'OutputBlockRules',
    fields: [
      'RuleName',
      'Description',
      'Disabled',
      'SrcIP',
      'DstIP',
      'DstPort',
      'Protocol'
    ],
    required: ['SrcIP', 'DstIP', 'Protocol'],
    add: (rule) => firewallAPI.addOutputBLock(rule),
    remove: (rule) => firewallAPI.deleteOutputBlock(rule)
  }
}

const OPERATIONS = ['add', 'delete', 'update']
const READ_TOOLS = ['get_firewall_config', 'list_devices']
const READ_TOOL_TIMEOUT_MS = 10000
const DEVICE_ARRAY_FIELDS = ['Groups', 'Policies', 'DeviceTags']
const DEVICE_STRING_FIELDS = ['Name', 'RecentIP', 'VLANTag']

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const safeString = (value, field) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    value = String(value)
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }

  const normalized = value.trim()
  if (normalized.length > 256 || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error(`${field} contains an invalid value`)
  }
  return normalized
}

const normalizeRule = (rule, spec) => {
  if (!isPlainObject(rule)) {
    throw new Error('Rule data must be an object')
  }

  const normalized = {}
  spec.fields.forEach((field) => {
    if (rule[field] === undefined || rule[field] === null) return

    if (field === 'Disabled') {
      if (typeof rule[field] !== 'boolean') {
        throw new Error('Disabled must be true or false')
      }
      normalized[field] = rule[field]
      return
    }

    if (field === 'Tags') {
      if (!Array.isArray(rule[field])) {
        throw new Error('Tags must be an array')
      }
      normalized[field] = [
        ...new Set(
          rule[field].map((tag) => safeString(tag, 'Tags')).filter(Boolean)
        )
      ]
      return
    }

    normalized[field] = safeString(rule[field], field)
  })

  if (normalized.Protocol) {
    normalized.Protocol = normalized.Protocol.toLowerCase()
    if (!['tcp', 'udp'].includes(normalized.Protocol)) {
      throw new Error('Protocol must be tcp or udp')
    }
  }

  return normalized
}

const normalizeDeviceChanges = (changes) => {
  if (!isPlainObject(changes)) {
    throw new Error('Device changes must be an object')
  }

  const normalized = {}
  DEVICE_STRING_FIELDS.forEach((field) => {
    if (changes[field] === undefined || changes[field] === null) return
    normalized[field] = safeString(changes[field], field)
  })
  DEVICE_ARRAY_FIELDS.forEach((field) => {
    if (changes[field] === undefined || changes[field] === null) return
    if (!Array.isArray(changes[field])) {
      throw new Error(`${field} must be an array`)
    }
    normalized[field] = [
      ...new Set(
        changes[field]
          .map((value) => safeString(value, field))
          .filter(Boolean)
      )
    ]
  })

  if (!Object.keys(normalized).length) {
    throw new Error('At least one supported device field must change')
  }
  return normalized
}

const normalizedDeviceSnapshot = (device) => ({
  Name: device.Name || '',
  MAC: device.MAC || '',
  RecentIP: device.RecentIP || '',
  VLANTag: device.VLANTag || '',
  Groups: device.Groups || [],
  Policies: device.Policies || [],
  DeviceTags: device.DeviceTags || []
})

const ensureRequiredFields = (rule, spec) => {
  spec.required.forEach((field) => {
    if (!rule[field]) {
      throw new Error(`${field} is required`)
    }
  })
}

export const validateDeviceProposal = (proposal) => {
  if (!isPlainObject(proposal)) {
    throw new Error('The proposed device update is invalid')
  }

  const identity = safeString(proposal.identity || '', 'identity').toLowerCase()
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(identity)) {
    throw new Error('Device identity must be an exact MAC address')
  }

  return {
    proposalType: 'device',
    operation: 'update',
    identity,
    label: 'device',
    reason: safeString(proposal.reason || 'Requested in chat', 'reason'),
    changes: normalizeDeviceChanges(proposal.changes)
  }
}

export const validateProposal = (proposal) => {
  if (proposal?.proposalType === 'device') {
    return validateDeviceProposal(proposal)
  }

  if (!isPlainObject(proposal)) {
    throw new Error('The proposed change is invalid')
  }

  const operation = String(proposal.operation || '').toLowerCase()
  if (!OPERATIONS.includes(operation)) {
    throw new Error('Operation must be add, delete, or update')
  }

  const ruleType = String(proposal.ruleType || '').toLowerCase()
  const spec = RULE_TYPES[ruleType]
  if (!spec) {
    throw new Error(`Unsupported rule type: ${ruleType || 'missing'}`)
  }

  const rule = normalizeRule(proposal.rule, spec)
  const previousRule =
    operation === 'update'
      ? normalizeRule(proposal.previousRule, spec)
      : operation === 'delete'
        ? rule
        : null

  if (operation === 'add' || operation === 'update') {
    ensureRequiredFields(rule, spec)
  }

  if (
    (operation === 'delete' || operation === 'update') &&
    !Object.keys(previousRule || {}).length
  ) {
    throw new Error('The existing rule to match is required')
  }

  return {
    operation,
    ruleType,
    label: spec.label,
    reason: safeString(proposal.reason || 'Requested in chat', 'reason'),
    rule,
    previousRule
  }
}

export const proposalDiff = (proposal) => {
  if (proposal?.proposalType === 'device') {
    const normalized = validateDeviceProposal(proposal)
    if (!proposal.previousDevice) {
      throw new Error('The current device state is required for review')
    }
    const before = normalizedDeviceSnapshot(proposal.previousDevice)
    const after = {
      ...before,
      ...normalized.changes,
      MAC: normalized.identity
    }
    return {
      ...normalized,
      previousDevice: before,
      nextDevice: after,
      before,
      after
    }
  }

  const normalized = validateProposal(proposal)
  return {
    ...normalized,
    before: normalized.operation === 'add' ? null : normalized.previousRule,
    after: normalized.operation === 'delete' ? null : normalized.rule
  }
}

const comparableValue = (value) =>
  Array.isArray(value) ? JSON.stringify([...value].sort()) : String(value)

const ruleMatches = (candidate, requested) =>
  Object.entries(requested).every(
    ([key, value]) =>
      candidate[key] !== undefined &&
      comparableValue(candidate[key]) === comparableValue(value)
  )

const findExistingRule = async (proposal, spec) => {
  const config = await firewallAPI.config()
  const candidates = (config[spec.configKey] || []).filter((candidate) =>
    ruleMatches(candidate, proposal.previousRule)
  )

  if (!candidates.length) {
    throw new Error(`The ${spec.label} no longer exists`)
  }
  if (candidates.length > 1) {
    throw new Error(
      `More than one ${spec.label} matches. Ask the assistant for a more specific change.`
    )
  }
  return candidates[0]
}

const findDevice = async (identity) => {
  const devices = Object.values((await deviceAPI.list()) || {})
  const matches = devices.filter(
    (device) => String(device.MAC || '').toLowerCase() === identity
  )
  if (!matches.length) {
    throw new Error(`Device ${identity} no longer exists`)
  }
  if (matches.length > 1) {
    throw new Error(`More than one device has identity ${identity}`)
  }
  return matches[0]
}

export const prepareProposal = async (proposal) => {
  if (proposal?.proposalType === 'device') {
    const normalized = validateDeviceProposal(proposal)
    const previousDevice = normalizedDeviceSnapshot(
      await findDevice(normalized.identity)
    )
    return {
      ...normalized,
      previousDevice,
      nextDevice: {
        ...previousDevice,
        ...normalized.changes,
        MAC: normalized.identity
      }
    }
  }

  const normalized = validateProposal(proposal)
  if (normalized.operation === 'add') {
    return normalized
  }

  const spec = RULE_TYPES[normalized.ruleType]
  const existing = await findExistingRule(normalized, spec)
  const previousRule = normalizeRule(existing, spec)
  return {
    ...normalized,
    previousRule,
    rule: normalized.operation === 'delete' ? previousRule : normalized.rule
  }
}

export const applyProposal = async (proposal) => {
  if (proposal?.proposalType === 'device') {
    const normalized = validateDeviceProposal(proposal)
    const currentDevice = normalizedDeviceSnapshot(
      await findDevice(normalized.identity)
    )
    if (
      proposal.previousDevice &&
      JSON.stringify(currentDevice) !==
        JSON.stringify(normalizedDeviceSnapshot(proposal.previousDevice))
    ) {
      throw new Error(
        'The device changed after review. Please prepare the update again.'
      )
    }
    await deviceAPI.update(normalized.identity, normalized.changes)
    return {
      ...normalized,
      previousDevice: currentDevice,
      nextDevice: {
        ...currentDevice,
        ...normalized.changes,
        MAC: normalized.identity
      }
    }
  }

  const normalized = validateProposal(proposal)
  const spec = RULE_TYPES[normalized.ruleType]

  if (normalized.operation === 'add') {
    await spec.add(normalized.rule)
    return normalized
  }

  const existing = await findExistingRule(normalized, spec)
  if (normalized.operation === 'delete') {
    await spec.remove(existing)
    return { ...normalized, previousRule: existing }
  }

  await spec.remove(existing)
  try {
    await spec.add(normalized.rule)
  } catch (error) {
    await spec.add(existing).catch(() => {})
    throw error
  }
  return { ...normalized, previousRule: existing }
}

const sanitizedFirewallConfig = (config) =>
  Object.fromEntries(
    Object.entries(RULE_TYPES).map(([ruleType, spec]) => [
      ruleType,
      (config[spec.configKey] || []).map((rule) => normalizeRule(rule, spec))
    ])
  )

const sanitizedDevices = (devices) =>
  Object.values(devices || {}).map((device) => ({
    Name: device.Name || '',
    MAC: device.MAC || '',
    RecentIP: device.RecentIP || '',
    VLANTag: device.VLANTag || '',
    Groups: device.Groups || [],
    DeviceTags: device.DeviceTags || [],
    Policies: device.Policies || []
  }))

const readWithTimeout = (request, label) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            `SPR API timed out while ${label}. Check the router connection and try again.`
          )
        ),
      READ_TOOL_TIMEOUT_MS
    )

    Promise.resolve(request).then(
      (result) => {
        clearTimeout(timeout)
        resolve(result)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })

export const executeReadTool = async (tool) => {
  if (!READ_TOOLS.includes(tool)) {
    throw new Error(`Unsupported read tool: ${tool}`)
  }

  if (tool === 'get_firewall_config') {
    return sanitizedFirewallConfig(
      await readWithTimeout(
        firewallAPI.config(),
        'reading the firewall configuration'
      )
    )
  }

  return sanitizedDevices(
    await readWithTimeout(deviceAPI.list(), 'listing devices')
  )
}

export const isReadTool = (tool) => READ_TOOLS.includes(tool)

export const ruleTypeDescriptions = Object.entries(RULE_TYPES)
  .map(([name, spec]) => `${name}: ${spec.fields.join(', ')}`)
  .join('\n')
