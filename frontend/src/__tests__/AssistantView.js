import React from 'react'
import { act, fireEvent, render, screen, waitFor } from 'test-utils'

import { AlertContext } from 'AppContext'
import Assistant, { ChatBubble } from 'views/Assistant/Assistant.web'

const mockLoadWebLLM = jest.fn()
const mockIsModelCached = jest.fn()

jest.mock('components/Assistant/webllmModels.web', () => ({
  ...jest.requireActual('components/Assistant/webllmModels.web'),
  isWebLLMModelCached: (...arguments_) => mockIsModelCached(...arguments_),
  loadWebLLM: (...arguments_) => mockLoadWebLLM(...arguments_)
}))

beforeEach(() => {
  mockLoadWebLLM.mockReset()
  mockIsModelCached.mockReset().mockResolvedValue(false)
  window.localStorage.data = {}
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
    window.localStorage.getItem('spr-assistant/action-system-prompt-v2')
  ).toBe('My custom action prompt')
  expect(
    window.localStorage.getItem('spr-assistant/chat-system-prompt-v2')
  ).toBe('My custom response prompt')
})

test('keeps the main assistant view focused on chat', () => {
  render(<Assistant />)

  expect(screen.getByText('Browser-local chat')).toBeTruthy()
  expect(screen.getByText('Ask about devices or firewall rules.')).toBeTruthy()
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

  expect(screen.getByText('Assistant settings')).toBeTruthy()
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

  expect(await screen.findByText('LFM3 1.7B ready')).toBeTruthy()
  expect(
    screen.queryByText('LFM3 1.7B is ready. Inference stays in this browser.')
  ).toBeNull()
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'lfm3-1.7b' }),
    expect.any(Function),
    16384
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

  expect(await screen.findByText('Loading LFM3 1.7B')).toBeTruthy()

  await act(async () => finishLoading())
  expect(await screen.findByText('LFM3 1.7B ready')).toBeTruthy()
})

const mockEngine = () => ({
  unload: jest.fn().mockResolvedValue(),
  resetChat: jest.fn().mockResolvedValue()
})

test('settings list both models without the removed explanations', () => {
  render(<Assistant />)

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))

  expect(screen.getByText('LFM3 1.7B')).toBeTruthy()
  expect(screen.getByText('Qwen3 1.7B')).toBeTruthy()
  expect(screen.getByText('about 1.1 GB · 16K context')).toBeTruthy()
  expect(screen.getByText('about 968 MB · 8K context')).toBeTruthy()
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

test('loads the selected model with the chosen context size', async () => {
  mockLoadWebLLM.mockResolvedValue(mockEngine())
  render(<Assistant />)

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.press(screen.getByText('Qwen3 1.7B'))
  expect(screen.queryByRole('radio', { name: '128K context' })).toBeNull()
  fireEvent.press(screen.getByRole('radio', { name: '32K context' }))

  expect(screen.getByText('about 968 MB · 32K context')).toBeTruthy()
  expect(
    JSON.parse(window.localStorage.getItem('spr-assistant/context-tokens-v1'))
  ).toEqual({ 'qwen3-1.7b': 32768 })

  fireEvent.press(
    await screen.findByRole('button', { name: 'Review download' })
  )
  fireEvent.press(screen.getByRole('button', { name: 'Download and load' }))

  expect(await screen.findByText('Qwen3 1.7B ready')).toBeTruthy()
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'qwen3-1.7b' }),
    expect.any(Function),
    32768
  )
  expect(window.localStorage.getItem('spr-assistant/model-v1')).toBe(
    'qwen3-1.7b'
  )
})

test('reloads the loaded model when its context size changes', async () => {
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'lfm3-1.7b')
  )
  mockLoadWebLLM.mockResolvedValue(mockEngine())
  render(<Assistant />)

  expect(await screen.findByText('LFM3 1.7B ready')).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
  expect(
    screen.getByText('Chat is using LFM3 1.7B with 16K context')
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
    await screen.findByText('Chat is using LFM3 1.7B with 128K context')
  ).toBeTruthy()
})

test('automatically loads the last used model and context', async () => {
  window.localStorage.setItem('spr-assistant/model-v1', 'qwen3-1.7b')
  window.localStorage.setItem(
    'spr-assistant/context-tokens-v1',
    JSON.stringify({ 'qwen3-1.7b': 16384 })
  )
  mockIsModelCached.mockResolvedValue(true)
  mockLoadWebLLM.mockResolvedValue(mockEngine())

  render(<Assistant />)

  expect(await screen.findByText('Qwen3 1.7B ready')).toBeTruthy()
  expect(mockLoadWebLLM).toHaveBeenCalledTimes(1)
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'qwen3-1.7b' }),
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
  expect(await screen.findByText('LFM3 1.7B ready')).toBeTruthy()

  fireEvent.changeText(screen.getByLabelText('Message Assistant'), 'hello')
  fireEvent.press(screen.getByText('Send', { includeHiddenElements: true }))

  expect(
    await screen.findByText(
      'The local model could not answer: The local model returned an empty response'
    )
  ).toBeTruthy()
  expect(alerts.error).toHaveBeenCalledWith(
    'Local assistant error',
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
