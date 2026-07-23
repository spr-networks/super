import {
  getModel,
  getCachedWebLLMBackend,
  getWebLLMAppConfig,
  isWebLLMModelCached,
  loadWebLLM
} from 'components/Assistant/webllmModels.web'

const mockCreateMLCEngine = jest.fn()
const mockHasModelInCache = jest.fn()

jest.mock('components/Assistant/webllmRuntime.web', () => ({
  getWebLLMRuntime: jest.fn().mockResolvedValue({
    CreateMLCEngine: (...arguments_) =>
      mockCreateMLCEngine(...arguments_),
    hasModelInCache: (...arguments_) =>
      mockHasModelInCache(...arguments_)
  })
}))

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true
  })
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: {
      requestAdapter: jest.fn().mockResolvedValue({
        features: new Set()
      })
    }
  })
})

test('checks both persistent cache backends', async () => {
  const model = getModel('qwen3-1.7b')
  mockHasModelInCache.mockImplementation((modelId, appConfig) =>
    Promise.resolve(appConfig.cacheBackend === 'indexeddb')
  )

  await expect(isWebLLMModelCached(model)).resolves.toBe(true)
  expect(mockHasModelInCache).toHaveBeenCalledWith(
    model.record.model_id,
    getWebLLMAppConfig(model, 'cache')
  )
  expect(mockHasModelInCache).toHaveBeenCalledWith(
    model.record.model_id,
    getWebLLMAppConfig(model, 'indexeddb')
  )
  await expect(getCachedWebLLMBackend(model)).resolves.toBe('indexeddb')
})

test('does not let a stalled Cache API probe block IndexedDB autoload', async () => {
  const model = getModel('qwen3-1.7b')
  mockHasModelInCache.mockImplementation((modelId, appConfig) =>
    appConfig.cacheBackend === 'cache'
      ? new Promise(() => {})
      : Promise.resolve(true)
  )

  await expect(getCachedWebLLMBackend(model)).resolves.toBe('indexeddb')
})

test('loads Cache API weights without the uncached network preflight', async () => {
  const model = getModel('qwen3-1.7b')
  const engine = { chat: {} }
  const fetchBefore = global.fetch
  global.fetch = jest.fn()
  mockHasModelInCache.mockResolvedValue(true)
  mockCreateMLCEngine.mockResolvedValue(engine)

  await expect(loadWebLLM(model, jest.fn())).resolves.toBe(engine)

  expect(global.fetch).not.toHaveBeenCalled()
  expect(mockCreateMLCEngine).toHaveBeenCalledWith(model.record.model_id, {
    appConfig: getWebLLMAppConfig(model, 'cache'),
    initProgressCallback: expect.any(Function)
  })
  global.fetch = fetchBefore
})

test('reuses an existing IndexedDB download', async () => {
  const model = getModel('qwen3-1.7b')
  const engine = { chat: {} }
  const fetchBefore = global.fetch
  global.fetch = jest.fn()
  mockHasModelInCache.mockImplementation((modelId, appConfig) =>
    Promise.resolve(appConfig.cacheBackend === 'indexeddb')
  )
  mockCreateMLCEngine.mockResolvedValue(engine)

  await expect(loadWebLLM(model, jest.fn())).resolves.toBe(engine)

  expect(global.fetch).not.toHaveBeenCalled()
  expect(mockCreateMLCEngine).toHaveBeenCalledWith(model.record.model_id, {
    appConfig: getWebLLMAppConfig(model, 'indexeddb'),
    initProgressCallback: expect.any(Function)
  })
  global.fetch = fetchBefore
})

test('uses the requested Qwen3 8K context override', () => {
  expect(getModel('qwen3-1.7b').record).toEqual(
    expect.objectContaining({
      model_id: 'Qwen3-1.7B-q4f16_1-MLC',
      overrides: { context_window_size: 8192 }
    })
  )
})
