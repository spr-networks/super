import {
  isReadTool,
  validateDeviceProposal,
  validateProposal
} from './assistantTools'
import {
  CHAT_SYSTEM_PROMPT,
  SYSTEM_PROMPT
} from './assistantPrompt'

export const ASSISTANT_RESPONSE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    kind: { enum: ['message', 'tool_call'] },
    tool: {
      enum: [
        'get_firewall_config',
        'list_devices',
        'propose_firewall_change',
        'propose_device_update'
      ]
    },
    message: { type: 'string' },
    arguments: { type: 'object' }
  },
  required: ['kind'],
  additionalProperties: false
})

const MUTATION_PATTERN =
  /\b(add|allow|apply|assign|block|change|create|delete|disable|enable|forward|give|grant|modify|move|open|remove|rename|revoke|set|update)\b/

const FIREWALL_CONFIG_KEYS = {
  endpoint: 'endpoint',
  port_forward: 'port_forward',
  inbound_block: 'inbound_block',
  forward_block: 'forward_block',
  outbound_block: 'outbound_block'
}

const isLikelyDeviceMutation = (userText) =>
  /\b(device|devices|group|groups|internet access|policy|policies|tag|tags|rename)\b/.test(
    userText.toLowerCase()
  )

const needsFirewallSnapshot = (userText) => {
  const text = userText.toLowerCase()
  return (
    /\b(change|delete|modify|remove|update)\b/.test(text) &&
    /\b(block|firewall|forward|rule)\b/.test(text)
  )
}

const isDeviceReachabilityQuestion = (userText) =>
  /\b(can|could|does|is|will)\b[\s\S]*\b(access|communicate|connect|reach|talk)\b/i.test(
    userText
  )

const reachabilityEvidence = (userText, devices) => {
  const text = userText.toLowerCase()
  const mentioned = devices
    .map((device) => ({
      device,
      index: text.lastIndexOf(String(device.Name || '').toLowerCase())
    }))
    .filter(({ device, index }) => device.Name && index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ device }) => device)
  const [source, destination] = mentioned
  const sharedGroups =
    source && destination
      ? (source.Groups || []).filter((group) =>
          (destination.Groups || []).includes(group)
        )
      : []
  const sharedDeviceTags =
    source && destination
      ? (source.DeviceTags || []).filter((tag) =>
          (destination.DeviceTags || []).includes(tag)
        )
      : []
  const grants = []
  if (source?.Policies?.includes('lan')) {
    grants.push(
      `${source.Name} has the lan Policy, which permits ${source.Name} to initiate connections to ${destination?.Name || 'LAN devices'}`
    )
  }
  if (sharedGroups.length) {
    grants.push(
      `${source.Name} and ${destination.Name} share Group(s): ${sharedGroups.join(', ')}`
    )
  }

  return {
    source: source || null,
    destination: destination || null,
    networkModel:
      'SPR uses per-device isolation, commonly individual /30 networks. Similar RecentIP prefixes do not establish reachability.',
    explicitGrants: grants,
    sharedDeviceTags,
    conclusion: grants.length
      ? `Access from ${source?.Name || 'the source'} to ${destination?.Name || 'the destination'} is supported by the explicit grant(s) above, not by IP-prefix similarity. The reverse direction must be evaluated separately.`
      : 'No access grant is established by the current device Policies or shared Groups. Do not infer access from IP-prefix similarity; check applicable firewall/tag rules before claiming reachability.',
    tagRuleNote:
      'A shared DeviceTag is not permission by itself. Only an applicable configured firewall/tag rule grants access.'
  }
}

const sameValues = (left = [], right = []) =>
  left.length === right.length &&
  left.every((value) => right.includes(value))

const deviceMutationEvidence = (userText, devices) => {
  const text = userText.toLowerCase()
  const devicesByName = devices.reduce((result, device) => {
    const name = String(device.Name || '').toLowerCase()
    if (!name || !text.includes(name)) return result
    result[name] = [...(result[name] || []), device]
    return result
  }, {})
  const ambiguousNames = Object.entries(devicesByName)
    .filter(([, matches]) => matches.length > 1)
    .map(([name, matches]) => ({
      name,
      displayName: matches[0].Name,
      matches: matches.map(({ MAC, RecentIP }) => ({ MAC, RecentIP }))
    }))
  const mentioned = Object.values(devicesByName)
    .map((matches) => matches[0])
    .sort(
      (left, right) =>
        text.indexOf(String(left.Name).toLowerCase()) -
        text.indexOf(String(right.Name).toLowerCase())
    )
  const [firstDevice, secondDevice] = mentioned
  const additive =
    /\b(add|allow|assign|enable|give|grant)\b/.test(text) &&
    !/\b(delete|disable|remove|revoke)\b/.test(text)
  const removeInternet =
    /\b(remove|revoke|disable)\b[\s\S]*\b(internet|wan)\b/.test(text)
  const groupMatch = userText.match(
    /\badd\s+(?:it|them|the device|[\w-]+)\s+to\s+(?:the\s+)?([a-z0-9_-]+)\s+group\b/i
  )
  const narrowAccess =
    additive &&
    /\bonly\b/.test(text) &&
    firstDevice &&
    secondDevice
  let recommendedNarrowGroup
  if (narrowAccess) {
    const sourceGroups = firstDevice.Groups || []
    const candidates = (secondDevice.Groups || []).filter(
      (group) => !sourceGroups.includes(group)
    )
    recommendedNarrowGroup = [...candidates].sort((left, right) => {
      const leftAccess = /access/i.test(left) ? 0 : 1
      const rightAccess = /access/i.test(right) ? 0 : 1
      if (leftAccess !== rightAccess) return leftAccess - rightAccess
      const countMembers = (group) =>
        devices.filter((device) =>
          (device.Groups || []).includes(group)
        ).length
      return countMembers(left) - countMembers(right)
    })[0]
  }

  const target = narrowAccess ? firstDevice : firstDevice
  const requiredGroups = [
    ...(groupMatch ? [groupMatch[1]] : []),
    ...(recommendedNarrowGroup ? [recommendedNarrowGroup] : [])
  ]
  const requiredPolicies =
    additive && /\b(internet access|wan access)\b/.test(text)
      ? ['wan']
      : []
  const expectedPolicies =
    removeInternet && target
      ? (target.Policies || []).filter((policy) => policy !== 'wan')
      : null

  return {
    ambiguousNames,
    target: target
      ? { Name: target.Name, MAC: target.MAC }
      : null,
    requestedAdditions: {
      Policies: requiredPolicies,
      Groups: [...new Set(requiredGroups)]
    },
    expectedPolicies,
    forbiddenPolicies: [
      ...(narrowAccess ? ['lan'] : []),
      ...(removeInternet ? ['wan'] : [])
    ],
    leastPrivilege:
      recommendedNarrowGroup && secondDevice
        ? `Add ${firstDevice.Name} to ${recommendedNarrowGroup}, an existing Group on ${secondDevice.Name}; do not add the broad lan Policy.`
        : null,
  }
}

const deviceMutationGuidance = (evidence) => {
  if (evidence.ambiguousNames.length) {
    const ambiguous = evidence.ambiguousNames[0]
    return (
      `There are ${ambiguous.matches.length} devices named ` +
      `"${ambiguous.name}". Return a message that says this and asks which ` +
      'MAC or RecentIP identifies the intended device. Do not return a tool call.'
    )
  }

  const requirements = []
  if (evidence.target) {
    requirements.push(
      `Target ${evidence.target.Name} with exact MAC ${evidence.target.MAC}.`
    )
  }
  if (evidence.requestedAdditions.Policies.length) {
    requirements.push(
      `The replacement Policies array must include ${JSON.stringify(evidence.requestedAdditions.Policies)}.`
    )
  }
  if (evidence.requestedAdditions.Groups.length) {
    requirements.push(
      `The replacement Groups array must include ${JSON.stringify(evidence.requestedAdditions.Groups)}.`
    )
  }
  if (evidence.expectedPolicies) {
    requirements.push(
      `Return propose_device_update with changes.Policies exactly ${JSON.stringify(evidence.expectedPolicies)}.`
    )
  }
  if (evidence.forbiddenPolicies.length) {
    requirements.push(
      `Do not include ${JSON.stringify(evidence.forbiddenPolicies)} in Policies.`
    )
  }
  if (evidence.leastPrivilege) {
    requirements.push(evidence.leastPrivilege)
  }

  return requirements.length > 1 ? requirements.join(' ') : ''
}

const enforceDeviceMutationEvidence = (proposal, evidence) => {
  if (evidence?.ambiguousNames?.length) {
    const ambiguous = evidence.ambiguousNames[0]
    throw new Error(
      `Device name "${ambiguous.name}" matches ${ambiguous.matches.length} current devices. Return a message asking which MAC or RecentIP identifies the intended device.`
    )
  }
  if (
    evidence?.target?.MAC &&
    proposal.identity !== evidence.target.MAC.toLowerCase()
  ) {
    throw new Error(
      `The requested target is ${evidence.target.Name} (${evidence.target.MAC}).`
    )
  }

  const policies = proposal.changes.Policies
  const groups = proposal.changes.Groups
  const requiredPolicies = evidence?.requestedAdditions?.Policies || []
  const requiredGroups = evidence?.requestedAdditions?.Groups || []
  if (
    requiredPolicies.length &&
    (!policies ||
      requiredPolicies.some((policy) => !policies.includes(policy)))
  ) {
    throw new Error(
      `The proposal must include requested Policies: ${requiredPolicies.join(', ')}.`
    )
  }
  if (
    requiredGroups.length &&
    (!groups || requiredGroups.some((group) => !groups.includes(group)))
  ) {
    throw new Error(
      `The proposal must include requested Groups: ${requiredGroups.join(', ')}.`
    )
  }
  if (
    evidence?.expectedPolicies &&
    !sameValues(policies || [], evidence.expectedPolicies)
  ) {
    throw new Error(
      `Policies must be exactly ${JSON.stringify(evidence.expectedPolicies)} after the requested removal.`
    )
  }
  const forbidden = evidence?.forbiddenPolicies || []
  if (policies?.some((policy) => forbidden.includes(policy))) {
    throw new Error(
      `The proposal must not include Policies: ${forbidden.join(', ')}.`
    )
  }
  return proposal
}

const inferReadTool = (userText) => {
  const text = userText.toLowerCase()
  const mutation = MUTATION_PATTERN.test(text)
  if (mutation) return null

  if (
    /\b(device|devices|client|clients|host|hosts)\b/.test(text) &&
    /\b(address|connected|inventory|ip|list|name|network|show|what|which)\b/.test(
      text
    )
  ) {
    return 'list_devices'
  }

  if (
    /\b(firewall|rule|rules|port forward|port forwarding)\b/.test(text) &&
    /\b(config|configuration|current|existing|list|show|summarize|what|which)\b/.test(
      text
    )
  ) {
    return 'get_firewall_config'
  }

  return null
}

const isMutationRequest = (userText) =>
  MUTATION_PATTERN.test(userText.toLowerCase())

const valuesMatch = (actual, expected) =>
  Array.isArray(expected)
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : String(actual) === String(expected)

const ruleContains = (candidate, selector) =>
  Object.entries(selector || {}).every(
    ([field, value]) =>
      candidate[field] !== undefined &&
      valuesMatch(candidate[field], value)
  )

const exactExistingRule = (arguments_, toolResults) => {
  const operation = String(arguments_?.operation || '').toLowerCase()
  if (!['delete', 'update'].includes(operation)) return null

  const ruleType = String(arguments_?.ruleType || '').toLowerCase()
  const configKey = FIREWALL_CONFIG_KEYS[ruleType]
  if (!configKey) return null

  const config = [...toolResults]
    .reverse()
    .find(({ tool }) => tool === 'get_firewall_config')?.result
  const selector =
    operation === 'update' ? arguments_?.previousRule : arguments_?.rule
  if (!config || !selector || !Object.keys(selector).length) return null

  const matches = (config[configKey] || []).filter((candidate) =>
    ruleContains(candidate, selector)
  )
  return matches.length === 1 ? matches[0] : null
}

const incompleteExistingRule = (arguments_, exactRule) => {
  if (!exactRule) return false
  const operation = String(arguments_?.operation || '').toLowerCase()
  const previous =
    operation === 'update' ? arguments_?.previousRule : arguments_?.rule
  const replacement = arguments_?.rule
  const fields = Object.keys(exactRule)
  return (
    fields.some((field) => previous?.[field] === undefined) ||
    (operation === 'update' &&
      fields.some((field) => replacement?.[field] === undefined))
  )
}

const retryActionMessage = ({
  error,
  exactRule,
  operation,
  proposedRule
}) => {
  if (exactRule) {
    const exact = JSON.stringify(exactRule)
    const completedReplacement = JSON.stringify({
      ...exactRule,
      ...(proposedRule || {})
    })
    return (
      `The proposal is incomplete and cannot be reviewed safely. ` +
      `The one exact current rule is ${exact}. ` +
      (operation === 'update'
        ? `Retry propose_firewall_change with previousRule exactly ${exact} ` +
          `and rule exactly ${completedReplacement}. `
        : `Retry propose_firewall_change with rule exactly ${exact}. `) +
      'Return exactly one valid JSON object.'
    )
  }
  return (
    `The proposal was rejected: ${error.message}. ` +
    'Correct it using the trusted tool result and return exactly one valid JSON object.'
  )
}

const validatedDeviceDecision = (arguments_, toolResults, userText) => {
  let directProposal
  try {
    directProposal = validateDeviceProposal(arguments_)
  } catch (error) {
    if (!error.message.includes('exact MAC address')) throw error
  }

  const requestedIdentity = String(arguments_?.identity || '').toLowerCase()
  const devices =
    [...toolResults]
      .reverse()
      .find(
        ({ tool, result }) =>
          tool === 'list_devices' && Array.isArray(result)
      )
      ?.result || []
  if (directProposal && !devices.length) {
    return directProposal
  }
  const matches = devices.filter(
    (device) =>
      String(device.MAC || '').toLowerCase() === requestedIdentity ||
      String(device.Name || '').toLowerCase() === requestedIdentity
  )
  if (matches.length !== 1) {
    throw new Error(
      `Device identity "${arguments_?.identity || ''}" did not uniquely match a current device`
    )
  }

  const isAdditive =
    /\b(add|allow|assign|enable|give|grant)\b/.test(userText.toLowerCase()) &&
    !/\b(delete|disable|remove|revoke)\b/.test(userText.toLowerCase())
  const changes = { ...arguments_.changes }
  if (isAdditive) {
    const arrayFields = ['Groups', 'Policies', 'DeviceTags']
    arrayFields.forEach((field) => {
      if (!Array.isArray(changes[field])) return
      changes[field] = [
        ...new Set([...(matches[0][field] || []), ...changes[field]])
      ]
    })
  }

  return validateDeviceProposal({
    ...arguments_,
    identity: matches[0].MAC,
    changes
  })
}

const formatReadToolResult = (tool, result) => {
  if (tool === 'list_devices' && Array.isArray(result)) {
    if (!result.length) return 'No devices were returned by the SPR API.'
    return [
      'Devices on your network:',
      ...result.map(
        (device) =>
          `- ${device.Name || 'Unnamed device'} — ${
            device.RecentIP || 'no recent IP'
          }`
      )
    ].join('\n')
  }

  return `Current SPR firewall configuration:\n${JSON.stringify(
    result,
    null,
    2
  )}`
}

const withoutReasoning = (content) =>
  content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()

const decisionJSON = (content) => {
  const cleaned = withoutReasoning(content)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  return start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned
}

const isDegenerateRepetition = (content) => {
  const words = content.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
  if (words.length < 24) return false
  const counts = words.reduce((result, word) => {
    result[word] = (result[word] || 0) + 1
    return result
  }, {})
  return Math.max(...Object.values(counts)) / words.length >= 0.5
}

const parseDecision = (content) => {
  const json = decisionJSON(content)
  let decision
  try {
    decision = JSON.parse(json)
  } catch (error) {
    if (/^\s*\{\s*"kind"\s*:\s*"message"/.test(json)) {
      return { kind: 'message' }
    }
    throw new Error('The local model returned an unreadable structured response')
  }

  if (!decision || !['message', 'tool_call'].includes(decision.kind)) {
    throw new Error('The local model returned an unsupported response')
  }
  return decision
}

const requestDecision = async (engine, messages) => {
  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.1,
    top_p: 0.9,
    seed: 0,
    max_tokens: 384,
    repetition_penalty: 1.05,
    response_format: {
      type: 'json_object',
      schema: ASSISTANT_RESPONSE_SCHEMA
    },
    extra_body: { enable_thinking: false }
  })

  const content = response?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('The local model returned an empty response')
  }
  try {
    return { decision: parseDecision(content), raw: content }
  } catch (error) {
    error.rawGeneration = { phase: 'action', content }
    throw error
  }
}

const requestChatMessage = async ({
  engine,
  history,
  userText,
  toolResults,
  systemPrompt,
  finalInstruction,
  generationOptions = {}
}) => {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: userText }
  ]
  toolResults.forEach(({ tool, result }) => {
    messages.push({
      role: 'user',
      content: `Trusted SPR API result from ${tool}:\n${JSON.stringify(result)}`
    })
  })
  if (finalInstruction) {
    messages.push({
      role: 'user',
      content: finalInstruction
    })
  }

  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    top_p: 0.8,
    repetition_penalty: 1.05,
    max_tokens: 256,
    ...generationOptions,
    extra_body: { enable_thinking: false }
  })
  const content = response?.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('The local model returned an empty response')
  }
  if (isDegenerateRepetition(content)) {
    const error = new Error(
      'The local model produced a degenerate repeated response'
    )
    error.rawGeneration = { phase: 'response', content }
    throw error
  }
  return {
    message: withoutReasoning(content),
    rawGeneration: { phase: 'response', content }
  }
}

export const runAssistantTurn = async ({
  engine,
  history,
  userText,
  executeReadTool,
  onActivity = () => {},
  maxSteps = 3,
  systemPrompt = SYSTEM_PROMPT,
  chatSystemPrompt = CHAT_SYSTEM_PROMPT
}) => {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: userText }
  ]
  const toolResults = []
  const rawGenerations = []
  let mutationEvidence
  const reachabilityQuestion =
    !isMutationRequest(userText) &&
    isDeviceReachabilityQuestion(userText)

  if (reachabilityQuestion) {
    try {
      onActivity('Reading devices and firewall rules from SPR…')
      const [devices, firewallConfig] = await Promise.all([
        executeReadTool('list_devices', {}),
        executeReadTool('get_firewall_config', {})
      ])
      toolResults.push(
        { tool: 'list_devices', result: devices },
        { tool: 'get_firewall_config', result: firewallConfig },
        {
          tool: 'app_reachability_evidence',
          result: reachabilityEvidence(userText, devices)
        }
      )
      const evidence = toolResults.at(-1).result
      const reachabilityInstruction = evidence.explicitGrants.length
        ? `Begin with "Yes." Name ${evidence.source?.Name} and ${evidence.destination?.Name}, and cite only the exact grant(s) in explicitGrants. Do not add wan or dns as device-to-device grants.`
        : `Begin with "No." State by name that ${evidence.source?.Name || 'the source'} cannot reach ${evidence.destination?.Name || 'the destination'} because no Policy, shared Group, or applicable rule grants that direction. Do not say that any Policy grants this source-to-destination path; a Policy on the destination does not grant inbound access.`
      const tagInstruction = evidence.sharedDeviceTags.length
        ? ' Explicitly say that their shared DeviceTag is only data/a label and does not grant permission.'
        : ''
      onActivity('Preparing the reachability answer locally…')
      const chatResponse = await requestChatMessage({
        engine,
        history,
        userText,
        toolResults,
        systemPrompt: chatSystemPrompt,
        finalInstruction:
          `${reachabilityInstruction}${tagInstruction} Answer in at most five sentences. ` +
          'Include every ' +
          'relevant fact from app_reachability_evidence: name the exact ' +
          'Policy, Group, or rule that grants access; explain SPR per-device ' +
          '/30 isolation and that similar IP prefixes do not grant access; ' +
          'and state that the grant is directional and the reverse direction ' +
          'must be evaluated separately. Do not replace those facts with a ' +
          'generic reference to an explicit grant.',
        generationOptions: {
          temperature: 0.1,
          top_p: 0.9,
          seed: 0
        }
      })
      rawGenerations.push(chatResponse.rawGeneration)
      return {
        kind: 'message',
        message: chatResponse.message,
        rawGenerations
      }
    } catch (error) {
      if (error.rawGeneration) {
        rawGenerations.push(error.rawGeneration)
      }
      error.rawGenerations = rawGenerations
      throw error
    }
  }

  const inferredReadTool = inferReadTool(userText)
  if (inferredReadTool) {
    onActivity(
      inferredReadTool === 'list_devices'
        ? 'Reading devices from SPR…'
        : 'Reading firewall configuration from SPR…'
    )
    const result = await executeReadTool(inferredReadTool, {})
    return {
      kind: 'message',
      message: formatReadToolResult(inferredReadTool, result),
      rawGenerations
    }
  }

  if (!isMutationRequest(userText)) {
    try {
      onActivity('Thinking locally…')
      const chatResponse = await requestChatMessage({
        engine,
        history,
        userText,
        toolResults,
        systemPrompt: chatSystemPrompt
      })
      rawGenerations.push(chatResponse.rawGeneration)
      return {
        kind: 'message',
        message: chatResponse.message,
        rawGenerations
      }
    } catch (error) {
      if (error.rawGeneration) {
        rawGenerations.push(error.rawGeneration)
      }
      error.rawGenerations = rawGenerations
      throw error
    }
  }

  try {
    if (isLikelyDeviceMutation(userText)) {
      onActivity('Reading devices from SPR…')
      const result = await executeReadTool('list_devices', {})
      toolResults.push({ tool: 'list_devices', result })
      mutationEvidence = deviceMutationEvidence(userText, result)
      if (mutationEvidence.ambiguousNames.length) {
        const ambiguous = mutationEvidence.ambiguousNames[0]
        return {
          kind: 'message',
          message:
            `More than one device is named ${ambiguous.displayName}. ` +
            'Choose the intended device by MAC or RecentIP: ' +
            ambiguous.matches
              .map(
                ({ MAC, RecentIP }) =>
                  `${MAC}${RecentIP ? ` (${RecentIP})` : ''}`
              )
              .join(', '),
          rawGenerations
        }
      }
      messages.push({
        role: 'user',
        content:
          `TRUSTED TOOL RESULT for list_devices:\n${JSON.stringify(result)}\n` +
          'Use an exact MAC from this result. Return the next JSON object.'
      })
      const guidance = deviceMutationGuidance(mutationEvidence)
      if (guidance) {
        messages.push({
          role: 'user',
          content:
            'TRUSTED APP REQUIREMENTS for this device request:\n' +
            `${guidance}\nReturn the next JSON object.`
        })
      }
    }

    if (needsFirewallSnapshot(userText)) {
      onActivity('Reading firewall configuration from SPR…')
      const result = await executeReadTool('get_firewall_config', {})
      toolResults.push({ tool: 'get_firewall_config', result })
      messages.push({
        role: 'user',
        content:
          `TRUSTED TOOL RESULT for get_firewall_config:\n${JSON.stringify(result)}\n` +
          'For delete, copy the one exact matching existing rule into rule. ' +
          'For update, copy it into previousRule and copy every field into rule ' +
          'before changing only the requested field. Return the next JSON object.'
      })
    }

    for (let step = 0; step < maxSteps; step += 1) {
      onActivity('Planning the requested action locally…')
      const { decision, raw } = await requestDecision(engine, messages)
      rawGenerations.push({ phase: 'action', content: raw })

      if (decision.kind === 'message') {
        const directMessage = String(decision.message || '').trim()
        if (directMessage) {
          return {
            kind: 'message',
            message: directMessage,
            rawGenerations
          }
        }

        const chatResponse = await requestChatMessage({
          engine,
          history,
          userText,
          toolResults,
          systemPrompt: chatSystemPrompt
        })
        rawGenerations.push(chatResponse.rawGeneration)
        return {
          kind: 'message',
          message: chatResponse.message,
          rawGenerations
        }
      }

      if (decision.tool === 'propose_firewall_change') {
        const exactRule = exactExistingRule(
          decision.arguments,
          toolResults
        )
        try {
          if (incompleteExistingRule(decision.arguments, exactRule)) {
            throw new Error('Every field from the existing rule is required')
          }
          return {
            kind: 'proposal',
            proposal: validateProposal(decision.arguments),
            rawGenerations
          }
        } catch (error) {
          if (step >= maxSteps - 1) throw error
          messages.push({ role: 'assistant', content: raw })
          messages.push({
            role: 'user',
            content: retryActionMessage({
              error,
              exactRule,
              operation: decision.arguments?.operation,
              proposedRule: decision.arguments?.rule
            })
          })
          continue
        }
      }

      if (decision.tool === 'propose_device_update') {
        try {
          const proposal = validatedDeviceDecision(
            decision.arguments,
            toolResults,
            userText
          )
          return {
            kind: 'proposal',
            proposal: enforceDeviceMutationEvidence(
              proposal,
              mutationEvidence
            ),
            rawGenerations
          }
        } catch (error) {
          if (step >= maxSteps - 1) throw error
          messages.push({ role: 'assistant', content: raw })
          messages.push({
            role: 'user',
            content: retryActionMessage({ error })
          })
          continue
        }
      }

      if (!isReadTool(decision.tool)) {
        throw new Error(
          `The local model requested an unsupported tool: ${decision.tool}`
        )
      }

      const cachedResult = [...toolResults]
        .reverse()
        .find(({ tool }) => tool === decision.tool)
      if (!cachedResult) {
        onActivity(
          decision.tool === 'list_devices'
            ? 'Reading devices from SPR…'
            : 'Reading firewall configuration from SPR…'
        )
      }
      const result = cachedResult
        ? cachedResult.result
        : await executeReadTool(decision.tool, decision.arguments || {})
      if (!cachedResult) {
        toolResults.push({ tool: decision.tool, result })
      }
      messages.push({ role: 'assistant', content: raw })
      messages.push({
        role: 'user',
        content:
          `TOOL RESULT for ${decision.tool}:\n${JSON.stringify(result)}\n` +
          'Continue by returning the next JSON object.'
      })
    }
  } catch (error) {
    if (error.rawGeneration) {
      rawGenerations.push(error.rawGeneration)
    }
    error.rawGenerations = rawGenerations
    throw error
  }

  const error = new Error(
    'The local model used too many tool steps. Try a more specific request.'
  )
  error.rawGenerations = rawGenerations
  throw error
}
