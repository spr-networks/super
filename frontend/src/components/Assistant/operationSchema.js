export const object = (properties = {}, required = [], options = {}) => ({
  type: 'object', properties, required, additionalProperties: false, ...options
})
export const string = (options = {}) => ({ type: 'string', maxLength: 4096, ...options })
export const integer = (options = {}) => ({ type: 'integer', ...options })
export const number = (options = {}) => ({ type: 'number', ...options })
export const boolean = () => ({ type: 'boolean' })
export const array = (items, options = {}) => ({ type: 'array', items, maxItems: 256, ...options })
export const enumValue = (values) => ({ enum: values })
export const jsonObject = (options = {}) => ({ type: 'object', additionalProperties: true, ...options })

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
export const validateInput = (value, schema, path = 'input', depth = 0) => {
  if (depth > 16) throw new Error(`${path} is too deeply nested`)
  if (value === undefined) throw new Error(`${path} is required`)
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    throw new Error(`${path} must be one of ${schema.enum.join(', ')}`)
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some((candidate) => {
      try { validateInput(value, candidate, path, depth + 1); return true } catch { return false }
    })
    if (!matches) throw new Error(`${path} does not match an allowed shape`)
    return value
  }
  const type = schema.type
  if (type && !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)) throw new Error(`${path} has an unsupported type`)
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error(`${path} must be a plain object`)
    const keys = Object.keys(value)
    if (keys.length > (schema.maxProperties || 256)) throw new Error(`${path} has too many fields`)
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) throw new Error(`${path}.${required} is required`)
    }
    for (const key of keys) {
      if (forbiddenKeys.has(key)) throw new Error(`${path}.${key} is forbidden`)
      const child = schema.properties?.[key]
      if (!child && schema.additionalProperties === false) throw new Error(`${path}.${key} is not supported`)
      validateInput(value[key], child || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : inferredSchema(value[key])), `${path}.${key}`, depth + 1)
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
    if (value.length > (schema.maxItems ?? 256) || value.length < (schema.minItems || 0)) throw new Error(`${path} has an invalid item count`)
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) throw new Error(`${path} must contain distinct items`)
    value.forEach((item, index) => validateInput(item, schema.items || inferredSchema(item), `${path}[${index}]`, depth + 1))
  } else if (type === 'string') {
    if (typeof value !== 'string') throw new Error(`${path} must be a string`)
    if (value.length > (schema.maxLength ?? 4096) || value.length < (schema.minLength || 0) || /\u0000/.test(value)) throw new Error(`${path} has an invalid length or character`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} has an invalid format`)
  } else if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) throw new Error(`${path} must be a finite ${type}`)
    if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) throw new Error(`${path} is outside the allowed range`)
  } else if (type === 'boolean' && typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  else if (type === 'null' && value !== null) throw new Error(`${path} must be null`)
  return value
}

const inferredSchema = (value) => value === null ? { type: 'null' }
  : Array.isArray(value) ? array(undefined)
    : typeof value === 'object' ? jsonObject()
      : { type: typeof value }
