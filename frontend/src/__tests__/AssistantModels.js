import {
  DEFAULT_MODEL_KEY,
  firstJSONObject,
  freshReplyLength,
  getGenerationOptions,
  getModel,
  isWebLLMModelCached,
  loadWebLLM
} from 'components/Assistant/webllmModels.web'

const mockFromPretrained = jest.fn()

jest.mock('components/Assistant/webllmRuntime.web', () => ({
  getWebLLMRuntime: jest.fn().mockResolvedValue({
    Lfm3ForCausalLM: {
      from_pretrained: (...arguments_) => mockFromPretrained(...arguments_)
    }
  })
}))

const MiB = 1024 * 1024
const model = getModel(DEFAULT_MODEL_KEY)

const asyncRequest = (result) => {
  const request = {}
  setTimeout(() => {
    request.result = result
    request.onsuccess?.()
  }, 0)
  return request
}

// Mirrors the IndexedDB layout the vendored runtime writes:
// `meta` keyed by weight URL and `chunks` keyed by [url, begin, end].
const installGGUFCache = (stores) => {
  const close = jest.fn()
  const abort = jest.fn()
  global.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) }
  global.indexedDB = {
    open: jest.fn(() => {
      const request = {}
      setTimeout(() => {
        if (!stores) {
          request.transaction = { abort }
          request.onupgradeneeded?.()
          request.onerror?.()
          return
        }
        request.result = {
          close,
          objectStoreNames: { contains: (name) => name in stores },
          transaction: () => ({
            objectStore: (name) => ({
              get: (key) => asyncRequest(stores[name].get(key)),
              getAllKeys: ({ lower: [url] }) =>
                asyncRequest(stores[name].filter(([key]) => key === url))
            })
          })
        }
        request.onsuccess()
      }, 0)
      return request
    })
  }
  return { abort, close }
}

const storedWeights = (chunks) => ({
  meta: new Map([
    [
      model.record.url,
      { size: 100 * MiB, headerBytes: new Uint8Array(8 * MiB) }
    ]
  ]),
  chunks: chunks.map(([begin, end]) => [model.record.url, begin, end])
})

// Mirrors the runtime's turn object: streamed events plus a final result.
// Leaving the event loop early cancels the turn.
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

afterEach(() => {
  delete global.indexedDB
  delete global.IDBKeyRange
})

test('pins the LFM3 Q4_K_M GGUF weights to a Hugging Face revision', () => {
  expect(model.key).toBe('lfm3-1.7b')
  expect(model.record.url).toMatch(
    /^https:\/\/huggingface\.co\/LiquidAI\/LFM3-1\.7B-GGUF\/resolve\/[0-9a-f]{40}\/LFM3-1\.7B-Q4_K_M\.gguf$/
  )
})

test('reports stored weights as cached despite tensor alignment gaps', async () => {
  const { close } = installGGUFCache(
    storedWeights([
      [8 * MiB, 50 * MiB],
      [50 * MiB + 32, 100 * MiB]
    ])
  )

  await expect(isWebLLMModelCached(model)).resolves.toBe(true)
  expect(close).toHaveBeenCalled()
})

test('does not report a partial download as cached', async () => {
  installGGUFCache(storedWeights([[8 * MiB, 60 * MiB]]))

  await expect(isWebLLMModelCached(model)).resolves.toBe(false)
})

test('does not create the runtime cache database while probing', async () => {
  const { abort } = installGGUFCache(null)

  await expect(isWebLLMModelCached(model)).resolves.toBe(false)
  expect(abort).toHaveBeenCalled()
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
    maxLength: 8192,
    onProgress: expect.any(Function)
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
    max_new_tokens: 384 + 1536,
    enable_thinking: true,
    do_sample: false
  })
  expect(response.choices[0].message.content).toBe('{"kind":"message"}')
  expect(response.choices[0].finish_reason).toBe('stop')
})

test('retries a decision without reasoning when reasoning exhausts its budget', async () => {
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
    { max_new_tokens: 384 + 1536, enable_thinking: true, do_sample: false },
    { max_new_tokens: 384, enable_thinking: false, do_sample: false }
  ])
  expect(response.choices[0].message.content).toBe('{"kind":"message"}')
})

test('answers chat requests without reasoning', async () => {
  const { lfm3, session } = createModel()
  mockFromPretrained.mockResolvedValue(lfm3)
  const engine = await loadWebLLM(model, jest.fn())

  await engine.chat.completions.create({
    messages: [{ role: 'user', content: 'What is SPR?' }],
    max_tokens: 256,
    extra_body: { enable_thinking: false }
  })

  expect(session.generate.mock.calls[0][1]).toEqual({
    max_new_tokens: 256,
    enable_thinking: false,
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
  expect(response.choices[0].message.content).toBe(
    'SPR is a router. {not json'
  )
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
  expect(firstJSONObject('{"a":{"b":"}"}}}\n{"c":1}')).toBe(
    '{"a":{"b":"}"}}'
  )
  expect(firstJSONObject('{"a":{"b":["c","d"]},')).toBe(
    '{"a":{"b":["c","d"]}}'
  )
  expect(firstJSONObject('{"a":"unterminated')).toBe('{"a":"unterminated')
  expect(firstJSONObject('no object')).toBe('no object')
})

test('always decodes greedily and disables thinking by default', () => {
  expect(
    getGenerationOptions({ temperature: 0.7, top_p: 0.8, max_tokens: 64 })
  ).toEqual({
    max_new_tokens: 64,
    enable_thinking: false,
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
