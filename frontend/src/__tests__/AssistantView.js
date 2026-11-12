import React from 'react'
import { act, fireEvent, render, screen, waitFor } from 'test-utils'

import { AlertContext } from 'AppContext'
import Assistant, { ChatBubble, clearAssistantMemory } from 'views/Assistant/Assistant.web'
import { wifiAPI, deviceAPI } from 'api'

const mockLoadWebLLM = jest.fn()
const mockIsModelCached = jest.fn()

jest.mock('components/Assistant/webllmModels.web', () => ({
  ...jest.requireActual('components/Assistant/webllmModels.web'),
  isWebLLMModelCached: (...arguments_) => mockIsModelCached(...arguments_),
  loadWebLLM: (...arguments_) => mockLoadWebLLM(...arguments_)
}))

beforeEach(() => {
  clearAssistantMemory()
  mockLoadWebLLM.mockReset()
  mockIsModelCached.mockReset().mockResolvedValue(false)
  window.localStorage.data = {}
  window.localStorage.setItem('spr-assistant/terminal-v1', 'off')
})

describe('terminal view', () => {
  beforeEach(() => {
    window.localStorage.data = {}
  })

  test('is the default view', async () => {
    render(<Assistant />)

    expect(await screen.findByTestId('assistant-terminal')).toBeTruthy()
  })

  test('chat stays selected once chosen', () => {
    window.localStorage.setItem('spr-assistant/terminal-v1', 'off')
    render(<Assistant />)

    expect(screen.queryByTestId('assistant-terminal')).toBeNull()
  })

  test('loads a stored model automatically', async () => {
    mockIsModelCached.mockResolvedValue(true)
    mockLoadWebLLM.mockResolvedValue({
      unload: jest.fn().mockResolvedValue(),
      resetChat: jest.fn().mockResolvedValue()
    })
    render(<Assistant />)

    expect(
      await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')
    ).toBeTruthy()
    expect(mockLoadWebLLM).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('assistant-terminal-header-action')).toBeNull()
  })

  test('offers a model download next to the title until a model loads', async () => {
    render(<Assistant />)

    fireEvent.press(
      await screen.findByRole('link', { name: 'download a model' })
    )

    expect(
      await screen.findByText('Load supernetworks/LFM3-1.7B-Ask-SPR-GGUF?')
    ).toBeTruthy()
  })
})

test('lets the user inspect, edit, and persist both system prompts', () => {
  render(<Assistant />)

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  expect(screen.getByText('Select model')).toBeTruthy()
  const actionPrompt = screen.getByLabelText('Action and API system prompt')
  const responsePrompt = screen.getByLabelText(
    'Natural-language response system prompt'
  )
  expect(actionPrompt.props.value).toContain('Secure Programmable Router')
  expect(responsePrompt.props.value).toContain('browser-local SPR')
  expect(actionPrompt.props.value).toContain('propose_device_update')

  fireEvent.changeText(actionPrompt, 'My custom action prompt')
  fireEvent.changeText(responsePrompt, 'My custom response prompt')
  fireEvent.press(screen.getByRole('button', { name: 'Save prompts' }))

  expect(
    window.localStorage.getItem('spr-assistant/action-system-prompt-v3')
  ).toBe('My custom action prompt')
  expect(
    window.localStorage.getItem('spr-assistant/chat-system-prompt-v3')
  ).toBe('My custom response prompt')
})

test('keeps the main assistant view focused on chat', () => {
  render(<Assistant />)

  expect(screen.getByText('Browser-local chat')).toBeTruthy()
  expect(screen.getByText('Ask about devices, networking, DNS, firewall rules, monitoring, or system settings.')).toBeTruthy()
  expect(
    screen.queryByText(
      'Prompts and model inference stay in your browser. Read-only tools use your existing authenticated SPR session. Configuration changes always require a separate approval.'
    )
  ).toBeNull()
  expect(screen.queryByText('Nothing downloads until you confirm.')).toBeNull()
  expect(
    screen.queryByText('Browser-local SPR chat and action model')
  ).toBeNull()
})

test('links the unloaded model status to model download settings', async () => {
  render(<Assistant />)

  fireEvent.press(
    await screen.findByRole('link', { name: 'Load a model to begin' })
  )

  expect(screen.getByText('Ask SPR settings')).toBeTruthy()
  expect(screen.getByTestId('assistant-model-settings')).toBeTruthy()
  expect(screen.getByText('Select model')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Review download' })).toBeTruthy()
})

test('automatically initializes a cached LFM3 1.7B model', async () => {
  const engine = {
    unload: jest.fn().mockResolvedValue(),
    resetChat: jest.fn().mockResolvedValue()
  }
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'lfm3-1.7b')
  )
  mockLoadWebLLM.mockResolvedValue(engine)

  render(<Assistant />)

  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  expect(
    screen.queryByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF is ready. Inference stays in this browser.')
  ).toBeNull()
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'lfm3-1.7b' }),
    expect.any(Function),
    32768
  )
})

test('shows progress while a cached model initializes', async () => {
  const engine = {
    unload: jest.fn().mockResolvedValue(),
    resetChat: jest.fn().mockResolvedValue()
  }
  let finishLoading
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'lfm3-1.7b')
  )
  mockLoadWebLLM.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLoading = () => resolve(engine)
      })
  )

  render(<Assistant />)

  expect(await screen.findByText('Loading supernetworks/LFM3-1.7B-Ask-SPR-GGUF')).toBeTruthy()

  await act(async () => finishLoading())
  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
})

const mockEngine = () => ({
  unload: jest.fn().mockResolvedValue(),
  resetChat: jest.fn().mockResolvedValue()
})

test('settings list the model without the removed explanations', () => {
  render(<Assistant />)

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))

  expect(screen.getByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF')).toBeTruthy()
  expect(screen.getByText('about 1.1 GB · 32K context')).toBeTruthy()
  expect(
    screen.queryByText(/Browser-local and editable/, {
      includeHiddenElements: true
    })
  ).toBeNull()
  expect(
    screen.queryByText(/Defines SPR, selects read tools/, {
      includeHiddenElements: true
    })
  ).toBeNull()
})

test('loads the model with the chosen context size', async () => {
  mockLoadWebLLM.mockResolvedValue(mockEngine())
  render(<Assistant />)

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.press(screen.getByRole('radio', { name: '16K context' }))

  expect(screen.getByText('about 1.1 GB · 16K context')).toBeTruthy()
  expect(
    JSON.parse(window.localStorage.getItem('spr-assistant/context-tokens-v1'))
  ).toEqual({ 'lfm3-1.7b': 16384 })

  fireEvent.press(
    await screen.findByRole('button', { name: 'Review download' })
  )
  fireEvent.press(screen.getByRole('button', { name: 'Download and load' }))

  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'lfm3-1.7b' }),
    expect.any(Function),
    16384
  )
  expect(window.localStorage.getItem('spr-assistant/model-v1')).toBe(
    'lfm3-1.7b'
  )
})

test('reloads the loaded model when its context size changes', async () => {
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'lfm3-1.7b')
  )
  mockLoadWebLLM.mockResolvedValue(mockEngine())
  render(<Assistant />)

  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  expect(
    screen.getByText('Chat is using supernetworks/LFM3-1.7B-Ask-SPR-GGUF with 32K context')
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Model loaded' })).toBeTruthy()

  fireEvent.press(screen.getByRole('radio', { name: '128K context' }))
  fireEvent.press(
    screen.getByRole('button', { name: 'Reload with new context size' })
  )
  fireEvent.press(
    screen.getByRole('button', { name: 'Load from browser storage' })
  )

  await waitFor(() =>
    expect(mockLoadWebLLM).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'lfm3-1.7b' }),
      expect.any(Function),
      131072
    )
  )
  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  expect(
    await screen.findByText('Chat is using supernetworks/LFM3-1.7B-Ask-SPR-GGUF with 128K context')
  ).toBeTruthy()
})

test('automatically loads the last used model and context', async () => {
  window.localStorage.setItem('spr-assistant/model-v1', 'lfm3-1.7b')
  window.localStorage.setItem(
    'spr-assistant/context-tokens-v1',
    JSON.stringify({ 'lfm3-1.7b': 16384 })
  )
  mockIsModelCached.mockResolvedValue(true)
  mockLoadWebLLM.mockResolvedValue(mockEngine())

  render(<Assistant />)

  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  expect(mockLoadWebLLM).toHaveBeenCalledTimes(1)
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'lfm3-1.7b' }),
    expect.any(Function),
    16384
  )
})

test('shows a failed answer in the chat, not only as an alert', async () => {
  const alerts = { error: jest.fn(), success: jest.fn() }
  const engine = {
    ...mockEngine(),
    chat: {
      completions: {
        create: jest
          .fn()
          .mockResolvedValue({ choices: [{ message: { content: '' } }] })
      }
    }
  }
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'lfm3-1.7b')
  )
  mockLoadWebLLM.mockResolvedValue(engine)

  render(
    <AlertContext.Provider value={alerts}>
      <Assistant />
    </AlertContext.Provider>
  )
  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()

  fireEvent.changeText(screen.getByLabelText('Message Ask SPR'), 'hello')
  fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))

  expect(
    await screen.findByText(
      'The local model could not answer: The local model returned an empty response'
    )
  ).toBeTruthy()
  expect(alerts.error).toHaveBeenCalledWith(
    'Ask SPR error',
    'The local model returned an empty response'
  )
})

test('shows raw generations only when expanded', () => {
  render(
    <ChatBubble
      message={{
        role: 'assistant',
        content: 'The structured response failed.',
        rawGenerations: [{ phase: 'action', content: 'raw repeated output' }]
      }}
    />
  )

  expect(screen.queryByText('raw repeated output')).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: 'Show raw generation' }))
  expect(screen.getByText('raw repeated output')).toBeTruthy()
})

test('routes a semantic task through review, acceptance, readback and code-authored status', async () => {
  const alerts = { error: jest.fn(), success: jest.fn() }
  let name = 'Tablet'
  const inventory = jest.spyOn(deviceAPI, 'list').mockImplementation(async () => ({ tablet:
    { MAC: '02:00:00:00:00:01', Name: name, Policies: ['wan', 'dns'], DeviceTags: [], Groups: [] }
  }))
  const update = jest.spyOn(deviceAPI, 'update').mockImplementation(async (id, changes) => { name = changes.Name; return true })
  const decisions = [
    { kind: 'tool_call', tool: 'describe_ui_operations', arguments: { ids: ['tasks.devices.rename'] } },
    { kind: 'tool_call', tool: 'propose_ui_change', arguments: { operationId: 'tasks.devices.rename', input: { device: 'Tablet', name: 'School tablet' }, reason: 'Requested rename' } }
  ]
  const engine = { ...mockEngine(), chat: { completions: { create: jest.fn().mockImplementation(async () => ({ choices: [{ message: { content: JSON.stringify(decisions.shift()) } }] })) } } }
  mockIsModelCached.mockImplementation((model) => Promise.resolve(model.key === 'lfm3-1.7b'))
  mockLoadWebLLM.mockResolvedValue(engine)
  try {
    render(<AlertContext.Provider value={alerts}><Assistant /></AlertContext.Provider>)
    await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')
    fireEvent.changeText(screen.getByLabelText('Message Ask SPR'), 'Rename Tablet to School tablet.')
    fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))
    await screen.findByText('Review change')
    expect(update).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Accept and apply'))
    await waitFor(() => expect(update).toHaveBeenCalledWith('02:00:00:00:00:01', { Name: 'School tablet' }))
    await screen.findByText('Continue task')
    expect(update).toHaveBeenCalledTimes(1)
    await screen.findByText('Task status: configured')
    expect(alerts.success).toHaveBeenCalledWith('Change applied and verified')
    expect(alerts.error).not.toHaveBeenCalled()
    expect(inventory).toHaveBeenCalled()
  } finally {
    inventory.mockRestore()
    update.mockRestore()
  }
})

test('a chat correction replaces an unapplied review and only the replacement can be accepted', async () => {
  const alerts = { error: jest.fn(), success: jest.fn() }
  let name = 'Tablet'
  const inventory = jest.spyOn(deviceAPI, 'list').mockImplementation(async () => ({ tablet:
    { MAC: '02:00:00:00:00:01', Name: name, Policies: ['wan', 'dns'], DeviceTags: [], Groups: [] }
  }))
  const update = jest.spyOn(deviceAPI, 'update').mockImplementation(async (id, changes) => { name = changes.Name; return true })
  const decisions = ['School tablet', 'Reading tablet'].flatMap(name => [
    { kind: 'tool_call', tool: 'describe_ui_operations', arguments: { ids: ['tasks.devices.rename'] } },
    { kind: 'tool_call', tool: 'propose_ui_change', arguments: { operationId: 'tasks.devices.rename', input: { device: 'Tablet', name } } }
  ])
  const create = jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify(decisions.shift()) } }] }))
  mockIsModelCached.mockImplementation(model => Promise.resolve(model.key === 'lfm3-1.7b'))
  mockLoadWebLLM.mockResolvedValue({ ...mockEngine(), chat: { completions: { create } } })
  try {
    render(<AlertContext.Provider value={alerts}><Assistant /></AlertContext.Provider>)
    await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')
    fireEvent.changeText(screen.getByLabelText('Message Ask SPR'), 'Rename Tablet to School tablet.')
    fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))
    await screen.findByText('Review change')
    expect(update).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByLabelText('Message Ask SPR'), 'Actually, call it Reading tablet instead.')
    fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(4))
    await screen.findByText('Review change')
    expect(update).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Accept and apply'))
    await waitFor(() => expect(update).toHaveBeenCalledWith('02:00:00:00:00:01', { Name: 'Reading tablet' }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(alerts.error).not.toHaveBeenCalled()
  } finally {
    inventory.mockRestore()
    update.mockRestore()
  }
})

describe('device cards and per-turn read cache', () => {
  const { referencedDevices } = require('views/Assistant/Assistant.web')
  const saved = [{ Name: 'k13', MAC: 'AA:00:00:00:00:01', RecentIP: '192.0.2.9', Groups: ['lan'], Policies: ['wan'], DeviceTags: [], PSKEntry: { Psk: 'secret' } },
    { Name: 'k1', MAC: 'AA:00:00:00:00:02', Groups: [], Policies: [], DeviceTags: [] }]
  test('devices come from result identities first, then whole-word names, without credentials', () => {
    expect(referencedDevices(saved, [{ identity: 'aa:00:00:00:00:02', name: 'k1' }], ['k13']).map(d => d.name)).toEqual(['k1'])
    const byName = referencedDevices(saved, [], ['what is the rssi of K13?'])
    expect(byName.map(d => d.name)).toEqual(['k13'])
    expect(JSON.stringify(byName)).not.toContain('secret')
    expect(referencedDevices(saved, [], ['nothing here'])).toEqual([])
  })
  test('a card links to the device page', () => {
    const { MemoryRouter } = require('react-router-dom')
    render(<MemoryRouter><ChatBubble message={{ id: '1', role: 'assistant', content: 'x', devices: referencedDevices(saved, [], ['k13']) }} /></MemoryRouter>)
    expect(screen.getByLabelText('Open device k13')).toBeTruthy()
    expect(screen.getByText(/Groups: lan · Policies: wan/)).toBeTruthy()
  })
  test('identical GETs are sent once while the cache is on, and a write empties it', async () => {
    const { default: API, setApiReadCache } = jest.requireActual('api/API')
    const real = global.fetch, calls = []
    global.fetch = jest.fn(async (url, opts) => { calls.push(opts.method); return new Response('{"n":1}', { status: 200, headers: { 'Content-Type': 'application/json' } }) })
    try {
      const client = new API('/x/'); client.authHeaders = 'Basic test'; client.remoteURL = 'http://192.0.2.1/'
      setApiReadCache(true)
      expect(await (await client.fetch('GET', 'a')).json()).toEqual({ n: 1 })
      expect(await (await client.fetch('GET', 'a')).json()).toEqual({ n: 1 })
      expect(calls).toEqual(['GET'])
      await client.fetch('PUT', 'a', {}); await client.fetch('GET', 'a')
      expect(calls).toEqual(['GET', 'PUT', 'GET'])
      setApiReadCache(false)
      await client.fetch('GET', 'a'); await client.fetch('GET', 'a')
      expect(calls.length).toBe(5)
    } finally { setApiReadCache(false); global.fetch = real }
  })
})

test('review shows only the changed fields, with list members as added or removed', () => {
  const { changedFields } = require('views/Assistant/Assistant.web')
  const before = { Name: 'k13', MAC: 'aa', Groups: ['lan'], Policies: ['wan'], Nested: { a: 1, b: 2 } }
  expect(changedFields(before, { ...before, Groups: ['lan', 'nzyme'] })).toEqual([{ path: 'Groups', added: ['nzyme'], removed: [], now: ['lan', 'nzyme'] }])
  expect(changedFields(before, { ...before, Name: 'K14', Nested: { a: 1, b: 3 } })).toEqual([{ path: 'Name', before: 'k13', after: 'K14' }, { path: 'Nested.b', before: 2, after: 3 }])
  expect(changedFields([{ Name: 'a', Policies: ['wan'] }, { Name: 'b', Policies: [] }], [{ Name: 'a', Policies: [] }, { Name: 'b', Policies: [] }]))
    .toEqual([{ path: 'a.Policies', added: [], removed: ['wan'], now: [] }])
  expect(changedFields(before, before)).toEqual([])
})

test('the conversation survives leaving the page and coming back, until reset', async () => {
  const alerts = { error: jest.fn(), success: jest.fn() }
  const engine = { ...mockEngine(), chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] }) } } }
  mockIsModelCached.mockImplementation((model) => Promise.resolve(model.key === 'lfm3-1.7b'))
  mockLoadWebLLM.mockResolvedValue(engine)
  const page = <AlertContext.Provider value={alerts}><Assistant /></AlertContext.Provider>
  const first = render(page)
  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Message Ask SPR'), 'remember this question')
  fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))
  expect(await screen.findByText(/The local model could not answer/)).toBeTruthy()
  first.unmount()
  render(page)
  expect(screen.getByText('remember this question')).toBeTruthy()
  expect(screen.getByText(/The local model could not answer/)).toBeTruthy()
  clearAssistantMemory()
})

test('the loaded model is reused when the page is reopened, not loaded a second time', async () => {
  mockIsModelCached.mockImplementation((model) => Promise.resolve(model.key === 'lfm3-1.7b'))
  mockLoadWebLLM.mockResolvedValue(mockEngine())
  const first = render(<Assistant />)
  expect(await screen.findByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  first.unmount()
  render(<Assistant />)
  expect(screen.getByText('supernetworks/LFM3-1.7B-Ask-SPR-GGUF ready')).toBeTruthy()
  await act(async () => { await Promise.resolve() })
  expect(mockLoadWebLLM).toHaveBeenCalledTimes(1)
  clearAssistantMemory()
})

test('a question handed over from another page is sent once the model is ready', async () => {
  const { MemoryRouter } = require('react-router-dom')
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] })
  mockIsModelCached.mockImplementation((model) => Promise.resolve(model.key === 'lfm3-1.7b'))
  mockLoadWebLLM.mockResolvedValue({ ...mockEngine(), chat: { completions: { create } } })
  render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/assistant', state: { ask: 'Show me the alert events' } }]}>
      <AlertContext.Provider value={{ error: jest.fn(), success: jest.fn() }}><Assistant /></AlertContext.Provider>
    </MemoryRouter>
  )
  expect(await screen.findByText('Show me the alert events')).toBeTruthy()
  await waitFor(() => expect(create).toHaveBeenCalled())
  clearAssistantMemory()
})

test('a reply with an embedded view shows no text bubble unless there is a note', () => {
  const first = render(<ChatBubble message={{ id: '1', role: 'assistant', content: '61 alert events read', view: 'other' }} />)
  expect(screen.queryByText('61 alert events read')).toBeNull()
  first.unmount()
  render(<ChatBubble message={{ id: '2', role: 'assistant', content: '61 alert events read', view: 'other', note: 'The Assistant could not read: alert:x.' }} />)
  expect(screen.getByText('The Assistant could not read: alert:x.')).toBeTruthy()
  expect(screen.queryByText('61 alert events read')).toBeNull()
})
