import { getLfm3Runtime, getWebLLMRuntime } from './webllmRuntime.web'

const LFM_3_REPO = 'https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF'
const LFM_3_REVISION = '4b423c332fd97961416f2e8b69467758fd27370d'
const LFM_3_FILE = 'LFM3-1.7B-Q4_K_M.gguf'

const QWEN_3_REPO = 'https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC'
const QWEN_3_REVISION = '80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc'
const WEBLLM_MODEL_LIB_BASE =
  'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_86/base'

const revisionURL = (repo, revision, path = '') =>
  `${repo}/resolve/${revision}/${path}`

export const MODEL_CATALOG = [
  {
    key: 'lfm3-1.7b',
    runtime: 'lfm3',
    name: 'LFM3 1.7B',
    detail: 'Browser-local SPR chat and action model',
    size: 'about 1.1 GB',
    contextTokens: 16384,
    contextSizes: [4096, 8192, 16384, 32768, 65536, 131072],
    source: 'Official Liquid AI GGUF on Hugging Face',
    sourceURL: LFM_3_REPO,
    caution:
      'The weights are licensed under the LFM Open License v1.0. The runtime may reduce the context to fit GPU memory.',
    promptFormat: 'LFM3 chat template · non-thinking mode',
    record: {
      // The runtime keys its weight cache by this URL.
      url: revisionURL(LFM_3_REPO, LFM_3_REVISION, LFM_3_FILE)
    }
  },
  {
    key: 'qwen3-1.7b',
    runtime: 'webllm',
    name: 'Qwen3 1.7B',
    detail: 'Browser-local SPR chat and action model',
    size: 'about 968 MB',
    contextTokens: 8192,
    contextSizes: [4096, 8192, 16384, 32768],
    source: 'Official mlc-ai MLC artifact on Hugging Face',
    sourceURL: QWEN_3_REPO,
    caution:
      'The MLC artifact is official. Contexts above the compiled default are experimental and need more GPU memory.',
    promptFormat:
      'Qwen3 chat template via WebLLM system/user roles · non-thinking mode',
    promptSuffix: '/no_think',
    record: {
      model: revisionURL(QWEN_3_REPO, QWEN_3_REVISION),
      model_id: 'Qwen3-1.7B-q4f16_1-MLC',
      model_lib: `${WEBLLM_MODEL_LIB_BASE}/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm`,
      vram_required_MB: 2036.66,
      low_resource_required: true
    }
  }
]

export const DEFAULT_MODEL_KEY = MODEL_CATALOG[0].key

export const getModel = (key) =>
  MODEL_CATALOG.find((model) => model.key === key) || MODEL_CATALOG[0]

export const contextLabel = (tokens) =>
  tokens >= 1024 ? `${Math.round(tokens / 1024)}K context` : `${tokens} context`

export const getContextTokens = (model, tokens) =>
  model.contextSizes.includes(Number(tokens))
    ? Number(tokens)
    : model.contextTokens

// The vendored runtime stores downloaded GGUF byte ranges in IndexedDB:
// `meta` is keyed by weight URL and `chunks` by [url, begin, end].
const GGUF_CACHE_DB = 'gguf-cache-v1'
// Alignment padding between tensors is never stored, so a complete
// download covers slightly less than the file's tensor data.
const CACHED_TENSOR_FRACTION = 0.99

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const openGGUFCache = () =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(GGUF_CACHE_DB)
    // Probing must not create the runtime's database.
    request.onupgradeneeded = () => request.transaction.abort()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

const coveredBytes = (chunkKeys) => {
  let covered = 0
  let coveredEnd = -Infinity
  chunkKeys
    .map(([, begin, end]) => [begin, end])
    .sort((a, b) => a[0] - b[0])
    .forEach(([begin, end]) => {
      if (end <= coveredEnd) return
      covered += end - Math.max(begin, coveredEnd)
      coveredEnd = end
    })
  return covered
}

const isLfm3ModelCached = async (model) => {
  const db = await openGGUFCache()
  if (!db) return false

  try {
    if (
      !db.objectStoreNames.contains('meta') ||
      !db.objectStoreNames.contains('chunks')
    ) {
      return false
    }
    const { url } = model.record
    const transaction = db.transaction(['meta', 'chunks'], 'readonly')
    const [meta, chunkKeys] = await Promise.all([
      requestResult(transaction.objectStore('meta').get(url)),
      requestResult(
        transaction
          .objectStore('chunks')
          .getAllKeys(IDBKeyRange.bound([url], [url, [], []]))
      )
    ])
    if (!meta?.size || !meta.headerBytes) return false

    const tensorBytes = meta.size - meta.headerBytes.byteLength
    return coveredBytes(chunkKeys) >= tensorBytes * CACHED_TENSOR_FRACTION
  } finally {
    db.close()
  }
}

export const WEBLLM_CACHE_BACKENDS = ['cache', 'indexeddb']
const CACHE_PROBE_TIMEOUT_MS = 5000

export const getWebLLMAppConfig = (
  model,
  cacheBackend = 'cache',
  contextTokens = model.contextTokens
) => ({
  cacheBackend,
  model_list: [
    {
      ...model.record,
      overrides: { context_window_size: contextTokens }
    }
  ]
})

export const getCachedWebLLMBackend = async (model, runtime) => {
  const { hasModelInCache } = runtime || (await getWebLLMRuntime())
  const pendingProbes = WEBLLM_CACHE_BACKENDS.map((cacheBackend) => {
    let settle
    const promise = new Promise((resolve) => {
      let timeout
      let settled = false
      settle = (cached) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(Boolean(cached))
      }
      timeout = setTimeout(() => settle(false), CACHE_PROBE_TIMEOUT_MS)
      Promise.resolve(
        hasModelInCache(
          model.record.model_id,
          getWebLLMAppConfig(model, cacheBackend)
        )
      ).then(settle, () => settle(false))
    })

    return {
      cancel: () => settle(false),
      promise: promise.then((cached) => {
        if (cached) return cacheBackend
        throw new Error(`${cacheBackend} cache miss`)
      })
    }
  })

  try {
    return await Promise.any(pendingProbes.map(({ promise }) => promise))
  } catch (error) {
    return null
  } finally {
    pendingProbes.forEach(({ cancel }) => cancel())
  }
}

export const isWebLLMModelCached = async (model) =>
  model.runtime === 'webllm'
    ? Boolean(await getCachedWebLLMBackend(model))
    : isLfm3ModelCached(model)

export const checkWebGPUSupport = async (model) => {
  if (!window.isSecureContext) {
    throw new Error('WebGPU model loading requires HTTPS or localhost')
  }
  if (!navigator.gpu) {
    throw new Error('This browser does not expose WebGPU')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('No compatible WebGPU adapter is available')
  }

  const missing = (model.record.required_features || []).filter(
    (feature) => !adapter.features.has(feature)
  )
  if (missing.length) {
    throw new Error(
      `The selected model requires WebGPU feature: ${missing.join(', ')}`
    )
  }
}

// Byte and tensor progress events interleave while weights stream to the
// GPU, so report the furthest fraction seen to keep the bar monotonic.
const progressReporter = (onProgress) => {
  let progress = 0
  return ({ loaded, total, message = '' }) => {
    if (total > 0) progress = Math.max(progress, Math.min(1, loaded / total))
    onProgress({ progress, text: message })
  }
}

// Maps the OpenAI-style requests used by the Assistant agent onto the
// runtime. Its fast decode path picks tokens inside a fused lm_head and
// cannot sample on many GPUs, so every request decodes greedily, as the
// upstream Space does. The runtime also has no repetition penalty, so
// sampling options and `repetition_penalty` are not forwarded.
// `thinkingTokens` adds a reasoning budget on top of the requested reply.
export const getGenerationOptions = (
  { max_tokens, extra_body = {} },
  thinkingTokens = 0
) => ({
  max_new_tokens:
    max_tokens === undefined ? undefined : max_tokens + thinkingTokens,
  enable_thinking: thinkingTokens > 0 || (extra_body.enable_thinking ?? false),
  do_sample: false
})

// On the Assistant eval, letting LFM3 reason before structured decisions
// fixed firewall and device proposals it otherwise got wrong, while reasoning
// before chat replies only used up their token budget. Decisions that
// exhaust this budget before answering are retried without reasoning.
const DECISION_THINKING_TOKENS = 1536

// Finds the first top-level JSON object in text. `end` is the index just
// past it, or -1 while `open` still holds unclosed brackets.
const scanJSONObject = (text) => {
  const start = text.indexOf('{')
  const open = []
  let inString = false
  let escaped = false
  if (start < 0) return { start, end: -1, open, inString }

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      open.push(char)
    } else if (char === '}' || char === ']') {
      open.pop()
      if (open.length === 0) return { start, end: index + 1, open, inString }
    }
  }
  return { start, end: -1, open, inString }
}

// The runtime has no grammar-constrained decoding, so emulate WebLLM's JSON
// mode: keep only the first object and close brackets left open when
// generation stopped early.
export const firstJSONObject = (text) => {
  const { start, end, open, inString } = scanJSONObject(text)
  if (end >= 0) return text.slice(start, end)
  if (start < 0 || inString) return text
  const closers = open.reverse().map((char) => (char === '{' ? '}' : ']'))
  return text.slice(start).replace(/[\s,]+$/, '') + closers.join('')
}

// Without a repetition penalty, greedy decoding can restate a finished
// answer or start echoing tool JSON. Returns the length of the reply before
// a sentence repeats or a JSON object begins, or -1 while it is still fresh.
export const freshReplyLength = (text) => {
  const boundary = /[.!?]+\s+|\n+/g
  const seen = new Set()
  let start = 0
  for (;;) {
    const match = boundary.exec(text)
    const end = match ? match.index + match[0].length : text.length
    const sentence = text.slice(start, end)
    if (/^\s*\{\s*"/.test(sentence)) return start
    if (!match) return -1

    const words = sentence
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
    if (words.split(' ').length >= 5) {
      if (seen.has(words)) return start
      seen.add(words)
    }
    start = end
  }
}

const freshReply = (text) => {
  const length = freshReplyLength(text)
  return length < 0 ? text : text.slice(0, length).trimEnd()
}

const createEngine = (model) => {
  const session = model.create_session()

  return {
    chat: {
      completions: {
        create: async (request) => {
          const jsonMode = request.response_format?.type === 'json_object'
          // Stop as soon as a JSON reply is complete or a chat reply turns
          // repetitive, instead of generating text that is thrown away.
          const isFinished = jsonMode
            ? (text) => scanJSONObject(text).end >= 0
            : (text) => freshReplyLength(text) >= 0
          const generate = async (thinkingTokens) => {
            const run = session.generate(
              request.messages,
              getGenerationOptions(request, thinkingTokens)
            )
            let streamed = ''
            for await (const event of run) {
              if (event.type !== 'text') continue
              streamed += event.text
              if (isFinished(streamed)) break
            }
            const { message, finish_reason, usage } = await run.result
            const content = jsonMode
              ? firstJSONObject(message.content)
              : freshReply(message.content)
            return {
              choices: [
                { index: 0, message: { ...message, content }, finish_reason }
              ],
              usage
            }
          }

          if (!jsonMode) return generate(0)
          const reasoned = await generate(DECISION_THINKING_TOKENS)
          return reasoned.choices[0].message.content.trim()
            ? reasoned
            : generate(0)
        }
      }
    },
    resetChat: async () => session.reset(),
    unload: async () => {
      await session.dispose()
      await model.dispose()
    }
  }
}

const loadMLCEngine = async (model, onProgress, contextTokens) => {
  const runtime = await getWebLLMRuntime()
  const cachedBackend = await getCachedWebLLMBackend(model, runtime)
  const appConfig = getWebLLMAppConfig(
    model,
    cachedBackend || 'cache',
    contextTokens
  )

  if (!cachedBackend) {
    const modelBase = model.record.model.endsWith('/')
      ? model.record.model
      : `${model.record.model}/`
    const configURL = new URL('mlc-chat-config.json', modelBase).href
    const configResponse = await fetch(configURL, { cache: 'no-store' })
    if (!configResponse.ok) {
      throw new Error(
        `Model configuration request failed (${configResponse.status}) at ${configURL}`
      )
    }
    const configText = await configResponse.text()
    try {
      JSON.parse(configText)
    } catch (error) {
      throw new Error(`Model configuration is not valid JSON at ${configURL}`)
    }
    if ('caches' in window) {
      const configCache = await window.caches.open('webllm/config')
      await configCache.delete(configURL)
    }
  }

  return runtime.CreateMLCEngine(model.record.model_id, {
    appConfig,
    initProgressCallback: onProgress
  })
}

export const loadWebLLM = async (
  model,
  onProgress,
  contextTokens = model.contextTokens
) => {
  await checkWebGPUSupport(model)
  if (model.runtime === 'webllm') {
    return loadMLCEngine(model, onProgress, contextTokens)
  }

  const { Lfm3ForCausalLM } = await getLfm3Runtime()
  // from_pretrained rejects an unsupported GPU after reading the GGUF
  // header and before streaming any weights.
  const lfm3 = await Lfm3ForCausalLM.from_pretrained(model.record.url, {
    maxLength: contextTokens,
    onProgress: progressReporter(onProgress)
  })
  return createEngine(lfm3)
}
