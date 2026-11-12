import { getLfm3Runtime } from './webllmRuntime.web'
import { ASK_SPR_Q4_K_M } from './modelHashes'
import { fetchFromVerifiedFile, isVerifiedFileStored, openVerifiedFile } from './modelIntegrity'

const LFM_3_REPO = 'https://huggingface.co/supernetworks/LFM3-1.7B-Ask-SPR-GGUF'
const LFM_3_REVISION = 'a3817b86e87db35df8075346258b41e34330acda'
const LFM_3_FILE = 'LFM3-1.7B-Ask-SPR-Q4_K_M.gguf'

const revisionURL = (repo, revision, path = '') =>
  `${repo}/resolve/${revision}/${path}`

export const MODEL_CATALOG = [
  {
    key: 'lfm3-1.7b',
    runtime: 'lfm3',
    name: 'LFM3 1.7B',
    detail: 'Browser-local SPR chat and action model',
    size: 'about 1.1 GB',
    contextTokens: 32768,
    contextSizes: [4096, 8192, 16384, 32768, 65536, 131072],
    source: 'Supernetworks fine-tune of Liquid AI LFM3-1.7B on Hugging Face',
    sourceURL: LFM_3_REPO,
    caution:
      'The weights are licensed under the LFM Open License v1.0. The runtime may reduce the context to fit GPU memory.',
    promptFormat: 'LFM3 chat template · thinking mode',
    record: {
      url: revisionURL(LFM_3_REPO, LFM_3_REVISION, LFM_3_FILE)
    },
    weights: ASK_SPR_Q4_K_M
  }
]

const localGGUFURL = process.env.NODE_ENV === 'development'
  ? process.env.REACT_APP_LFM3_GGUF_URL
  : undefined
if (localGGUFURL) {
  MODEL_CATALOG.splice(1, 0, {
    ...MODEL_CATALOG[0],
    key: 'lfm3-spr-task-v2-local',
    name: process.env.REACT_APP_LFM3_GGUF_NAME || 'SPR task-v2 · full fine-tune',
    detail:
      process.env.REACT_APP_LFM3_GGUF_DETAIL ||
      'Experimental task assistant · local development model',
    source: 'Your local SPR full fine-tune',
    sourceURL: new URL(localGGUFURL, window.location.href).href,
    caution: 'Experimental Q4 model. Review proposed changes before applying them.',
    record: { url: new URL(localGGUFURL, window.location.href).href },
    weights: { sha256: (/[0-9a-f]{64}/.exec(localGGUFURL) || [])[0] }
  })
}

export const DEFAULT_MODEL_KEY = MODEL_CATALOG[0].key

export const getModel = (key) =>
  MODEL_CATALOG.find((model) => model.key === key) || MODEL_CATALOG[0]

export const contextLabel = (tokens) =>
  tokens >= 1024 ? `${Math.round(tokens / 1024)}K context` : `${tokens} context`

export const getContextTokens = (model, tokens) =>
  model.contextSizes.includes(Number(tokens))
    ? Number(tokens)
    : model.contextTokens

const isLfm3ModelCached = async (model) =>
  Boolean(model.weights?.sha256) && isVerifiedFileStored(model.weights)

const dropUnverifiedGGUFCaches = () => {
  try { globalThis.indexedDB?.deleteDatabase?.('gguf-cache-v1') } catch (error) { }
  try { globalThis.caches?.delete?.('gguf-v1-headers')?.catch?.(() => {}) } catch (error) { }
}

export const isWebLLMModelCached = async (model) => isLfm3ModelCached(model)

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
export const LFM_MAX_NEW_TOKENS = 8192
export const getGenerationOptions = ({ tools, chat_template_kwargs }) => ({
  max_new_tokens: LFM_MAX_NEW_TOKENS,
  enable_thinking: true,
  do_sample: false,
  ...(tools !== undefined ? { tools } : {}),
  chat_template_kwargs: { ...chat_template_kwargs, enable_thinking: true }
})

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

  const engine = {
    onStream: null,
    capabilities: { nativeTools: true, nativeToolRawText: true },
    chat: {
      completions: {
        create: async (request) => {
          const nativeMode = request.tools !== undefined
          if (nativeMode && !Array.isArray(request.tools)) throw new Error('Native tools must be an array')
          const jsonMode = !nativeMode && request.response_format?.type === 'json_object'
          // Stop as soon as a JSON reply is complete or a chat reply turns
          // repetitive, instead of generating text that is thrown away.
          const isFinished = nativeMode ? () => false : jsonMode
            ? (text) => scanJSONObject(text).end >= 0
            : (text) => freshReplyLength(text) >= 0
          const generate = async () => {
            const run = session.generate(
              nativeMode ? request.messages.map((message) => ({ ...message, content: message.content ?? '' })) : request.messages,
              getGenerationOptions(request)
            )
            let streamed = ''
            let reasoning = ''
            const publish = () => {
              if (!engine.onStream) return
              try { engine.onStream({ reasoning, text: streamed }) } catch (error) { }
            }
            for await (const event of run) {
              if (event.type === 'reasoning') { reasoning += event.text; publish(); continue }
              if (event.type !== 'text') continue
              streamed += event.text
              publish()
              if (isFinished(streamed)) break
            }
            const { message, finish_reason, usage, raw_text } = await run.result
            if (nativeMode) {
              return { choices: [{ index: 0, message, finish_reason }], usage, raw_text }
            }
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

          return generate()
        }
      }
    },
    resetChat: async () => session.reset(),
    unload: async () => {
      await session.dispose()
      await model.dispose()
    }
  }
  return engine
}

const requireHashes = (model, hashes) => {
  if (!hashes) throw new Error(`${model.name} has no recorded file hashes, so it cannot be verified and was not loaded`)
}

const verifyProgress = (onProgress) => ({ loaded, total, phase }) =>
  onProgress({
    progress: total > 0 ? Math.min(1, loaded / total) : 0,
    text: phase === 'verify' ? 'Verifying model files' : 'Downloading and verifying model files'
  })

export const loadWebLLM = async (
  model,
  onProgress,
  contextTokens = model.contextTokens
) => {
  await checkWebGPUSupport(model)
  requireHashes(model, model.weights?.sha256)
  const { url } = model.record
  const { sha256 } = model.weights
  dropUnverifiedGGUFCaches()
  const file = await openVerifiedFile({ url, sha256, bytes: model.weights.bytes, onProgress: verifyProgress(onProgress) })
  const { Lfm3ForCausalLM } = await getLfm3Runtime()
  const lfm3 = await Lfm3ForCausalLM.from_pretrained(url, {
    maxLength: contextTokens,
    onProgress: progressReporter(onProgress),
    cache: false,
    fetch: fetchFromVerifiedFile(url, file, sha256)
  })
  return createEngine(lfm3)
}
