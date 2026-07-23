import { getWebLLMRuntime } from './webllmRuntime.web'

const QWEN_3_REPO = 'https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC'
const QWEN_3_REVISION = '80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc'
const WEBLLM_MODEL_LIB_BASE =
  'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base'

const revisionURL = (repo, revision, path = '') =>
  `${repo}/resolve/${revision}/${path}`

export const MODEL_CATALOG = [
  {
    key: 'qwen3-1.7b',
    name: 'Qwen3 1.7B',
    detail: 'Browser-local SPR chat and action model',
    size: 'about 968 MB',
    context: '8K WebLLM context',
    contextTokens: 8192,
    source: 'Official mlc-ai MLC artifact on Hugging Face',
    sourceURL: QWEN_3_REPO,
    caution:
      'The MLC artifact is official. The 8K runtime override is experimental and requires about 2 GB of GPU memory.',
    promptFormat:
      'Qwen3 chat template via WebLLM system/user roles · non-thinking mode',
    promptSuffix: '/no_think',
    record: {
      model: revisionURL(QWEN_3_REPO, QWEN_3_REVISION),
      model_id: 'Qwen3-1.7B-q4f16_1-MLC',
      model_lib: `${WEBLLM_MODEL_LIB_BASE}/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm`,
      vram_required_MB: 2036.66,
      low_resource_required: true,
      overrides: {
        context_window_size: 8192
      }
    }
  }
]

export const getModel = (key) =>
  MODEL_CATALOG.find((model) => model.key === key) || MODEL_CATALOG[0]

export const WEBLLM_CACHE_BACKENDS = ['cache', 'indexeddb']
const CACHE_PROBE_TIMEOUT_MS = 5000

export const getWebLLMAppConfig = (model, cacheBackend = 'cache') => ({
  cacheBackend,
  model_list: [model.record]
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
  Boolean(await getCachedWebLLMBackend(model))

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

export const loadWebLLM = async (model, onProgress) => {
  await checkWebGPUSupport(model)
  const runtime = await getWebLLMRuntime()
  const cachedBackend = await getCachedWebLLMBackend(model, runtime)
  // The Cache API is WebLLM's default and most-tested persistent backend.
  // Keep IndexedDB detection above so existing downloads remain reusable.
  const appConfig = getWebLLMAppConfig(model, cachedBackend || 'cache')
  const isCached = Boolean(cachedBackend)

  if (!isCached) {
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
      // Drop an invalid response left behind by an older mock interceptor.
      // WebLLM will immediately repopulate this entry from the validated URL.
      await configCache.delete(configURL)
    }
  }

  return runtime.CreateMLCEngine(model.record.model_id, {
    appConfig,
    initProgressCallback: onProgress
  })
}
