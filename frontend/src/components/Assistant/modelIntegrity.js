const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

export const sha256Hex = async (buffer) => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle?.digest) throw new Error('This browser has no Web Crypto API, so model files cannot be verified')
  return toHex(await subtle.digest('SHA-256', buffer))
}

export class ModelIntegrityError extends Error {
  constructor(url, expected, actual) {
    super(`Model file failed its integrity check and was not loaded: ${url} (expected SHA-256 ${expected}, got ${actual})`)
    this.name = 'ModelIntegrityError'
    this.url = url
    this.expected = expected
    this.actual = actual
  }
}

const MODEL_DIRECTORY = 'spr-models'
const storedName = (sha256) => `${sha256}.gguf`

const modelDirectory = async () => {
  try {
    const root = await globalThis.navigator?.storage?.getDirectory?.()
    return root ? await root.getDirectoryHandle(MODEL_DIRECTORY, { create: true }) : null
  } catch (error) {
    return null
  }
}

const storedFile = async (directory, name) => {
  try {
    return await (await directory.getFileHandle(name)).getFile()
  } catch (error) {
    return null
  }
}

export const isVerifiedFileStored = async ({ sha256, bytes }) => {
  const directory = await modelDirectory()
  const file = directory && (await storedFile(directory, storedName(sha256)))
  return Boolean(file && file.size > 0 && (!bytes || file.size === bytes))
}

export const openVerifiedFile = async ({ url, sha256, bytes, onProgress = () => {}, fetch: fetchFile = globalThis.fetch }) => {
  const name = storedName(sha256)
  const directory = await modelDirectory()
  const matches = async (blob) => {
    onProgress({ loaded: 0, total: blob.size, phase: 'verify' })
    const actual = await sha256Hex(await blob.arrayBuffer())
    onProgress({ loaded: blob.size, total: blob.size, phase: 'verify' })
    return actual
  }

  if (directory) {
    const file = await storedFile(directory, name)
    if (file && file.size > 0) {
      if ((await matches(file)) === sha256) return file
      await directory.removeEntry(name).catch(() => {})
    }
  }

  const response = await fetchFile(url)
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}) at ${url}`)
  const total = bytes || Number(response.headers.get('content-length')) || 0
  const handle = directory ? await directory.getFileHandle(name, { create: true }).catch(() => null) : null
  const writable = handle?.createWritable ? await handle.createWritable().catch(() => null) : null
  const parts = []
  const reader = response.body.getReader()
  let loaded = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (writable) await writable.write(value)
      else parts.push(value)
      loaded += value.length
      onProgress({ loaded, total, phase: 'download' })
    }
  } catch (error) {
    await writable?.abort?.().catch(() => {})
    throw error
  }
  if (writable) await writable.close()
  const file = writable ? await handle.getFile() : new Blob(parts)
  const actual = await matches(file)
  if (actual !== sha256) {
    if (writable) await directory.removeEntry(name).catch(() => {})
    throw new ModelIntegrityError(url, sha256, actual)
  }
  return file
}

const headerValue = (headers, name) => {
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get(name)
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name)
  return key ? String(headers[key]) : null
}

export const fetchFromVerifiedFile = (url, blob, sha256) => async (input, init = {}) => {
  const target = typeof input === 'string' ? input : input?.url ?? String(input)
  if (target !== url) throw new Error(`Refused to fetch ${target}: only the verified model file may be read`)
  init.signal?.throwIfAborted?.()
  const size = blob.size
  const headers = { 'accept-ranges': 'bytes', 'content-type': 'application/octet-stream', etag: `"${sha256}"` }
  if (String(init.method || 'GET').toUpperCase() === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...headers, 'content-length': String(size) } })
  }
  const range = headerValue(init.headers, 'range')
  if (!range) return new Response(blob, { status: 200, headers: { ...headers, 'content-length': String(size) } })
  const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim())
  const begin = match ? Number(match[1]) : NaN
  const end = match ? (match[2] === '' ? size : Math.min(size, Number(match[2]) + 1)) : NaN
  if (!match || begin >= size || end <= begin) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  }
  return new Response(blob.slice(begin, end), {
    status: 206,
    headers: { ...headers, 'content-length': String(end - begin), 'content-range': `bytes ${begin}-${end - 1}/${size}` }
  })
}
