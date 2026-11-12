import {
  contextLabel,
  DEFAULT_MODEL_KEY,
  firstJSONObject,
  freshReplyLength,
  getContextTokens,
  getGenerationOptions,
  getModel,
  isWebLLMModelCached,
  loadWebLLM,
  MODEL_CATALOG
} from 'components/Assistant/webllmModels.web'

const mockFromPretrained = jest.fn()
const mockOpenVerifiedFile = jest.fn()
const mockIsVerifiedFileStored = jest.fn()
const mockVerifiedFetch = jest.fn()

jest.mock('components/Assistant/modelIntegrity', () => ({
  openVerifiedFile: (...arguments_) => mockOpenVerifiedFile(...arguments_),
  isVerifiedFileStored: (...arguments_) => mockIsVerifiedFileStored(...arguments_),
  fetchFromVerifiedFile: (...arguments_) => mockVerifiedFetch(...arguments_)
}))

jest.mock('components/Assistant/webllmRuntime.web', () => ({
  getLfm3Runtime: jest.fn().mockResolvedValue({
    Lfm3ForCausalLM: {
      from_pretrained: (...arguments_) => mockFromPretrained(...arguments_)
    }
  })
}))

const model = getModel(DEFAULT_MODEL_KEY)
const verifiedFile = { size: 1 }
const verifiedFetch = () => {}

const createRun = (result, events = []) => {
  const run = {
    result: Promise.resolve(result),
    cancelled: false,
    [Symbol.asyncIterator]: () => {
      let index = 0
      return {
        next: async () =>
          index < events.length
            ? { value: events[index++], done: false }
            : { value: undefined, done: true },
        return: async () => {
          run.cancelled = true
          return { value: undefined, done: true }
        }
      }
    }
  }
  return run
}

const createModel = (
  result = {
    message: { role: 'assistant', content: '{"kind":"message"}' },
    finish_reason: 'stop',
    usage: { prompt_tokens: 12, completion_tokens: 4 }
  },
  events = []
) => {
  const session = {
    generate: jest.fn(() => createRun(result, events)),
    reset: jest.fn(),
    dispose: jest.fn().mockResolvedValue()
  }
  return {
    session,
    lfm3: {
      create_session: jest.fn(() => session),
      dispose: jest.fn().mockResolvedValue()
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockOpenVerifiedFile.mockResolvedValue(verifiedFile)
  mockIsVerifiedFileStored.mockResolvedValue(false)
  mockVerifiedFetch.mockReturnValue(verifiedFetch)
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

test('pins the Ask SPR Q4_K_M GGUF weights to a Hugging Face revision', () => {
  expect(model.key).toBe('lfm3-1.7b')
  expect(model.record.url).toMatch(
    /^https:\/\/huggingface\.co\/supernetworks\/LFM3-1\.7B-Ask-SPR-GGUF\/resolve\/[0-9a-f]{40}\/LFM3-1\.7B-Ask-SPR-Q4_K_M\.gguf$/
  )
  expect(model.weights).toEqual({ bytes: 1099627072, sha256: 'f47d227f1b9e9fc5c27b388fe40cdf1b1a56384d7dc1fd72fa563107307b7a5f' })
})

test('reports LFM3 as cached only when its verified file is stored', async () => {
  await expect(isWebLLMModelCached(model)).resolves.toBe(false)
  mockIsVerifiedFileStored.mockResolvedValue(true)
  await expect(isWebLLMModelCached(model)).resolves.toBe(true)
  expect(mockIsVerifiedFileStored).toHaveBeenCalledWith(model.weights)
})

test('every model in the catalog records a SHA-256 for each file it downloads', () => {
  const sha256 = /^[0-9a-f]{64}$/
  MODEL_CATALOG.forEach((entry) => {
    expect(entry.runtime).toBe('lfm3')
    expect(entry.weights.sha256).toMatch(sha256)
  })
})

test('verifies the LFM3 file before the runtime sees it and serves the runtime from that file', async () => {
  const { lfm3 } = createModel()
  const order = []
  mockOpenVerifiedFile.mockImplementation(async ({ onProgress }) => {
    order.push('verify')
    onProgress({ loaded: 1, total: 4, phase: 'download' })
    onProgress({ loaded: 4, total: 4, phase: 'verify' })
    return verifiedFile
  })
  mockFromPretrained.mockImplementation(async () => { order.push('runtime'); return lfm3 })
  const onProgress = jest.fn()

  await loadWebLLM(model, onProgress)

  expect(order).toEqual(['verify', 'runtime'])
  expect(mockOpenVerifiedFile).toHaveBeenCalledWith(expect.objectContaining({
    url: model.record.url, sha256: model.weights.sha256, bytes: model.weights.bytes
  }))
  expect(mockVerifiedFetch).toHaveBeenCalledWith(model.record.url, verifiedFile, model.weights.sha256)
  expect(mockFromPretrained.mock.calls[0][1]).toEqual(expect.objectContaining({ cache: false, fetch: verifiedFetch }))
  expect(onProgress.mock.calls.map(([report]) => report)).toEqual([
    { progress: 0.25, text: 'Downloading and verifying model files' },
    { progress: 1, text: 'Verifying model files' }
  ])
})

test('does not start the runtime when the LFM3 file fails its check', async () => {
  mockOpenVerifiedFile.mockRejectedValue(new Error('Model file failed its integrity check'))

  await expect(loadWebLLM(model, jest.fn())).rejects.toThrow('integrity check')
  expect(mockFromPretrained).not.toHaveBeenCalled()
})

test('refuses a model with no recorded hash', async () => {
  await expect(loadWebLLM({ ...model, weights: undefined }, jest.fn())).rejects.toThrow('no recorded file hashes')
  expect(mockOpenVerifiedFile).not.toHaveBeenCalled()
  expect(mockFromPretrained).not.toHaveBeenCalled()
})

test('loads the pinned weights with the catalog context and progress', async () => {
  const { lfm3 } = createModel()
  mockFromPretrained.mockImplementation(async (url, { onProgress }) => {
    onProgress({ status: 'init', message: 'Requesting WebGPU device' })
    onProgress({
      status: 'weights',
      kind: 'bytes',
      loaded: 50,
      total: 100,
      message: 'Streaming weights'
    })
    onProgress({
      status: 'weights',
      kind: 'tensors',
      loaded: 1,
      total: 10,
      message: 'Uploading to GPU'
    })
    return lfm3
  })
  const onProgress = jest.fn()

  const engine = await loadWebLLM(model, onProgress)

  expect(mockFromPretrained).toHaveBeenCalledWith(model.record.url, {
    maxLength: 32768,
    onProgress: expect.any(Function),
    cache: false,
    fetch: verifiedFetch
  })
  expect(onProgress.mock.calls.map(([report]) => report)).toEqual([
    { progress: 0, text: 'Requesting WebGPU device' },
    { progress: 0.5, text: 'Streaming weights' },
    { progress: 0.5, text: 'Uploading to GPU' }
  ])
  expect(engine.chat.completions.create).toEqual(expect.any(Function))
})

test('maps Assistant chat completions onto a runtime session', async () => {
  const { lfm3, session } = createModel()
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())
  const messages = [
    { role: 'system', content: 'Return JSON' },
    { role: 'user', content: 'List devices' }
  ]

  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.1,
    top_p: 0.9,
    seed: 0,
    max_tokens: 384,
    repetition_penalty: 1.05,
    response_format: { type: 'json_object', schema: '{}' },
    extra_body: { enable_thinking: false }
  })

  expect(session.generate).toHaveBeenCalledTimes(1)
  expect(session.generate).toHaveBeenCalledWith(messages, {
    max_new_tokens: 8192,
    enable_thinking: true,
    chat_template_kwargs: { enable_thinking: true },
    do_sample: false
  })
  expect(response.choices[0].message.content).toBe('{"kind":"message"}')
  expect(response.choices[0].finish_reason).toBe('stop')
})

test('does not retry without thinking when the shared budget is exhausted', async () => {
  const { lfm3, session } = createModel()
  session.generate
    .mockReturnValueOnce(
      createRun({
        message: { role: 'assistant', content: '' },
        finish_reason: 'length',
        usage: {}
      })
    )
    .mockReturnValueOnce(
      createRun({
        message: { role: 'assistant', content: '{"kind":"message"}' },
        finish_reason: 'stop',
        usage: {}
      })
    )
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())
  const request = {
    messages: [{ role: 'user', content: 'Add a port forward' }],
    max_tokens: 384,
    response_format: { type: 'json_object', schema: '{}' },
    extra_body: { enable_thinking: false }
  }

  const response = await engine.chat.completions.create(request)

  expect(session.generate.mock.calls.map(([, options]) => options)).toEqual([
    { max_new_tokens: 8192, enable_thinking: true, chat_template_kwargs: { enable_thinking: true }, do_sample: false }
  ])
  expect(response.choices[0].message.content).toBe('')
  expect(response.choices[0].finish_reason).toBe('length')
})

test('answers chat requests with thinking in the same total budget', async () => {
  const { lfm3, session } = createModel()
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  await engine.chat.completions.create({
    messages: [{ role: 'user', content: 'What is SPR?' }],
    max_tokens: 256,
    extra_body: { enable_thinking: false }
  })

  expect(session.generate.mock.calls[0][1]).toEqual({
    max_new_tokens: 8192,
    enable_thinking: true,
    chat_template_kwargs: { enable_thinking: true },
    do_sample: false
  })
})

test('stops JSON-mode generation once the first object closes', async () => {
  const { lfm3, session } = createModel(
    {
      message: {
        role: 'assistant',
        content: '{"kind":"tool_call","tool":"list_devices","arguments":{}}}'
      },
      finish_reason: 'cancelled',
      usage: {}
    },
    [
      { type: 'text', text: '{"kind":"tool_call","tool":"list_devices",' },
      { type: 'text', text: '"arguments":{}}' },
      { type: 'text', text: '}\n{"kind":"message"}' }
    ]
  )
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: 'List devices' }],
    response_format: { type: 'json_object', schema: '{}' }
  })

  expect(session.generate.mock.results[0].value.cancelled).toBe(true)
  expect(response.choices[0].message.content).toBe(
    '{"kind":"tool_call","tool":"list_devices","arguments":{}}'
  )
})

test('leaves non-JSON chat replies untouched', async () => {
  const { lfm3, session } = createModel(
    {
      message: { role: 'assistant', content: 'SPR is a router. {not json' },
      finish_reason: 'stop',
      usage: {}
    },
    [{ type: 'text', text: 'SPR is a router. {not json' }]
  )
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: 'What is SPR?' }]
  })

  expect(session.generate.mock.results[0].value.cancelled).toBe(false)
  expect(response.choices[0].message.content).toBe('SPR is a router. {not json')
})

test('cuts chat replies that repeat themselves or echo JSON', async () => {
  const answer =
    'Yes, workstation can reach laserjet. They share the office Group.'
  const repeated = `${answer}\n\nYes, workstation can reach laserjet. Again.`
  const { lfm3, session } = createModel(
    { message: { role: 'assistant', content: repeated }, usage: {} },
    [
      { type: 'text', text: `${answer}\n\n` },
      { type: 'text', text: 'Yes, workstation can reach laserjet. ' },
      { type: 'text', text: 'Again.' }
    ]
  )
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: 'Can workstation access laserjet?' }]
  })

  expect(session.generate.mock.results[0].value.cancelled).toBe(true)
  expect(response.choices[0].message.content).toBe(answer)
  expect(
    freshReplyLength(`${answer}\n{"Name":"workstation","Groups":["office"]}`)
  ).toBe(answer.length + 1)
  expect(freshReplyLength(`${answer} Done.`)).toBe(-1)
})

test('keeps only the first JSON object and closes unfinished ones', () => {
  expect(firstJSONObject('{"a":{"b":"}"}}}\n{"c":1}')).toBe('{"a":{"b":"}"}}')
  expect(firstJSONObject('{"a":{"b":["c","d"]},')).toBe('{"a":{"b":["c","d"]}}')
  expect(firstJSONObject('{"a":"unterminated')).toBe('{"a":"unterminated')
  expect(firstJSONObject('no object')).toBe('no object')
})

test('always decodes greedily with thinking and one total runaway cap', () => {
  expect(
    getGenerationOptions({ temperature: 0.7, top_p: 0.8, max_tokens: 64 })
  ).toEqual({
    max_new_tokens: 8192,
    enable_thinking: true,
    chat_template_kwargs: { enable_thinking: true },
    do_sample: false
  })
})

test('resets the session and releases the model on unload', async () => {
  const { lfm3, session } = createModel()
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  await engine.resetChat()
  expect(session.reset).toHaveBeenCalled()

  await engine.unload()
  expect(session.dispose).toHaveBeenCalled()
  expect(lfm3.dispose).toHaveBeenCalled()
})

test('offers one model, LFM3, as the default', () => {
  expect(MODEL_CATALOG.map(({ key, runtime }) => [key, runtime])).toEqual([
    ['lfm3-1.7b', 'lfm3']
  ])
  expect(DEFAULT_MODEL_KEY).toBe('lfm3-1.7b')
})

test('only accepts context sizes the model offers', () => {
  const lfm3 = getModel('lfm3-1.7b')
  expect(getContextTokens(lfm3, undefined)).toBe(32768)
  expect(getContextTokens(lfm3, 131072)).toBe(131072)
  expect(getContextTokens(lfm3, '32768')).toBe(32768)
  expect(getContextTokens(lfm3, 5000)).toBe(32768)
  expect(contextLabel(16384)).toBe('16K context')
})

test('loads LFM3 with the requested context size', async () => {
  const { lfm3 } = createModel()
  mockFromPretrained.mockResolvedValue(lfm3)

  await loadWebLLM(model, jest.fn(), 131072)

  expect(mockFromPretrained).toHaveBeenCalledWith(model.record.url, {
    maxLength: 131072,
    onProgress: expect.any(Function),
    cache: false,
    fetch: verifiedFetch
  })
})
