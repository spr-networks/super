import { validateInput } from './operationSchema'

export const NATIVE_TOOL_SCHEMAS = [
  {
    "type": "function",
    "function": {
      "name": "describe_ui_operations",
      "description": "Discover operations by domain/search and inspect exact inputSchema and kind; use cursor to page results.",
      "parameters": {
        "type": "object",
        "properties": {
          "domain": {
            "type": "string"
          },
          "search": {
            "type": "string"
          },
          "ids": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "cursor": {
            "type": "integer",
            "minimum": 0
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 20
          }
        },
        "required": [],
        "additionalProperties": false
      }
    }
  }
]

export const typedNativeEnums = (value) => {
  if (Array.isArray(value)) return value.map(typedNativeEnums)
  if (!value || typeof value !== 'object') return value
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typedNativeEnums(item)]))
  if (result.enum?.length && !result.type) {
    const values = result.enum
    const type = values.every(item => typeof item === 'boolean') ? 'boolean'
      : values.every(item => typeof item === 'number' && Number.isInteger(item)) ? 'integer'
        : values.every(item => typeof item === 'number') ? 'number'
          : values.every(item => typeof item === 'string') ? 'string'
            : values.every(item => item === null) ? 'null' : null
    if (type) result.type = type
  }
  return result
}

export const nativeOperationTool = (spec) => {
  const action = {
    read: 'Read current state.',
    write: 'Prepare a proposal for user acceptance in the UI; this never applies the change.',
    ui: 'Open the existing UI workflow for its remaining user steps; this does not apply a change.'
  }[spec.kind]
  if (!action) throw new Error(`Unsupported native operation kind: ${spec.kind}`)
  return { type: 'function', defer_loading: true, function: {
    name: spec.id, description: `${action} ${spec.description}`,
    parameters: typedNativeEnums(spec.inputSchema)
  } }
}

const controlMarkup = /<\/?(?:tool_call|function|parameter|think)(?=[\s=>/]|$)|<\|/
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

export const strictNativeJSON = (text) => {
  const value = JSON.parse(text)
  const scopes = []
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}]/g)) {
    if (match[0] === '{') scopes.push(new Set())
    else if (match[0] === '}') scopes.pop()
    else if (/^\s*:/.test(text.slice(match.index + match[0].length))) {
      const key = JSON.parse(match[0])
      const keys = scopes[scopes.length - 1]
      if (keys?.has(key)) throw new Error(`Duplicate JSON argument key: ${key}`)
      keys?.add(key)
    }
  }
  return value
}

export const validateNativeArguments = (value, schema, path = 'arguments') => {
  const typed = !schema.type && (schema.properties || schema.required || schema.minProperties)
    ? { ...schema, type: 'object' } : schema
  validateInput(value, typed, path)
  if ('const' in schema && !equal(value, schema.const)) throw new Error(`${path} must match its declared constant`)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Object.keys(value).length < (schema.minProperties || 0)) throw new Error(`${path} must not be empty`)
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateNativeArguments(value[key], child, `${path}.${key}`)
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => validateNativeArguments(item, schema.items, `${path}[${i}]`))
  for (const constraint of schema.allOf || []) validateNativeArguments(value, constraint, path)
  if (schema.if) {
    let matches = true
    try { validateNativeArguments(value, schema.if, path) } catch { matches = false }
    const branch = matches ? schema.then : schema.else
    if (branch) validateNativeArguments(value, branch, path)
  }
  return value
}

const nativeFinalParts = (content, tools) => {
  const functions = new Map(tools.map(({ function: fn }) => [fn.name, fn]))
  const text = content.trim()
  if (!text) throw new Error('The local model returned an empty native final response')
  const start = content.indexOf('<tool_call>')
  if (start < 0) {
    if (controlMarkup.test(text)) throw new Error('Unframed native control markup in final response')
    return { decision: { kind: 'message', message: content }, assistantContent: content }
  }
  const close = content.indexOf('</tool_call>', start + '<tool_call>'.length)
  if (close < 0) throw new Error('Expected one complete native call')
  const end = close + '</tool_call>'.length
  const assistantContent = content.slice(0, start) + content.slice(end)
  if (controlMarkup.test(assistantContent)) throw new Error('Extra or dangling native control markup outside the call')
  const callText = content.slice(start, end)
  const match = /^<tool_call>\s*<function=([A-Za-z_][A-Za-z0-9_.:-]*)>\s*\n?([\s\S]*?)<\/function>\s*<\/tool_call>$/.exec(callText)
  if (!match) throw new Error('Expected one complete native function call')
  const [, name, body] = match
  const fn = functions.get(name)
  if (!fn) throw new Error(`Unknown native function: ${name}`)
  const args = {}
  const parameter = /\s*<parameter=([A-Za-z_][A-Za-z0-9_]*)>\r?\n([\s\S]*?)\r?\n<\/parameter>/y
  let position = 0
  while (body.slice(position).trim()) {
    parameter.lastIndex = position
    const item = parameter.exec(body)
    if (!item) throw new Error('Malformed native parameter sequence')
    const [, key, raw] = item
    if (Object.prototype.hasOwnProperty.call(args, key)) throw new Error(`Duplicate native parameter: ${key}`)
    const field = fn.parameters.properties[key]
    if (!field) throw new Error(`Undeclared native parameter: ${key}`)
    if (controlMarkup.test(raw)) throw new Error('Nested control markup inside native parameter')
    const isString = field.type === 'string' || (field.enum && field.enum.every((value) => typeof value === 'string'))
    Object.defineProperty(args, key, { value: isString ? raw : strictNativeJSON(raw), enumerable: true })
    position = parameter.lastIndex
  }
  validateNativeArguments(args, fn.parameters)
  return { decision: { kind: 'tool_call', tool: name, arguments: args }, assistantContent, callSpan: { start, end } }
}

export const parseNativeFinal = (content, tools = NATIVE_TOOL_SCHEMAS) => nativeFinalParts(content, tools).decision

export const parseNativeCompletion = ({ rawText, message, finishReason, tools = NATIVE_TOOL_SCHEMAS }) => {
  if (typeof rawText !== 'string') throw new Error('Native runtime did not provide raw tool markup for validation')
  const boundary = rawText.indexOf('</think>')
  const reasoningPrefix = boundary >= 0 ? rawText.slice(0, boundary) : ''
  const finalText = boundary >= 0 ? rawText.slice(boundary + '</think>'.length) : rawText
  const { decision, assistantContent, callSpan } = nativeFinalParts(finalText, tools)
  const calls = message?.tool_calls || []
  if (!Array.isArray(calls)) throw new Error('Invalid runtime native tool call list')
  const reasoning = boundary >= 0 ? reasoningPrefix.replace(/^\s*<think>/, '') : message?.reasoning_content
  if (decision.kind === 'message') {
    if (calls.length) throw new Error('Runtime tool calls disagree with the validated final message')
    return { decision, finalText, reasoningPrefix, channelSplit: boundary >= 0,
      assistantMessage: { role: 'assistant', content: decision.message, ...(reasoning ? { reasoning_content: reasoning } : {}) } }
  }
  if (finishReason !== 'tool_calls' || calls.length !== 1) throw new Error('Expected one completed native tool call')
  if (typeof message.content !== 'string' || message.content !== assistantContent.trim()) {
    throw new Error('Raw assistant content disagrees with the runtime parsed content')
  }
  const call = calls[0]
  if (!call || call.type !== 'function' || typeof call.id !== 'string' || !call.id ||
      Object.keys(call).some((key) => !['id', 'type', 'function', 'errors'].includes(key))) throw new Error('Invalid runtime tool call fields')
  if (call.errors !== undefined && (!Array.isArray(call.errors) || call.errors.length)) throw new Error(`Native tool parse failed: ${JSON.stringify(call.errors)}`)
  if (!call.function || Object.keys(call.function).some((key) => !['name', 'arguments'].includes(key)) ||
      call.function.name !== decision.tool || !equal(call.function.arguments, decision.arguments)) {
    throw new Error('Raw native arguments disagree with the runtime parsed call')
  }
  return { decision, finalText, reasoningPrefix, channelSplit: boundary >= 0, toolCallId: call.id, callSpan, assistantContent,
    assistantMessage: { role: 'assistant', content: message.content, ...(reasoning ? { reasoning_content: reasoning } : {}),
      tool_calls: [{ id: call.id, type: 'function', function: { name: decision.tool, arguments: decision.arguments } }] } }
}
