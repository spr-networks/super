import React from 'react'
import { act, fireEvent, render, screen, waitFor } from 'test-utils'

import Assistant, { ChatBubble } from 'views/Assistant/Assistant.web'

const mockLoadWebLLM = jest.fn()
const mockIsModelCached = jest.fn()

jest.mock('components/Assistant/webllmModels.web', () => ({
  ...jest.requireActual('components/Assistant/webllmModels.web'),
  isWebLLMModelCached: (...arguments_) =>
    mockIsModelCached(...arguments_),
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

test('automatically initializes a cached Qwen3 1.7B model', async () => {
  const engine = {
    unload: jest.fn().mockResolvedValue(),
    resetChat: jest.fn().mockResolvedValue()
  }
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'qwen3-1.7b')
  )
  mockLoadWebLLM.mockResolvedValue(engine)

  render(<Assistant />)

  expect(
    await screen.findByText('Qwen3 1.7B ready')
  ).toBeTruthy()
  expect(
    screen.queryByText(
      'Qwen3 1.7B is ready. Inference stays in this browser.'
    )
  ).toBeNull()
  expect(mockLoadWebLLM).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'qwen3-1.7b' }),
    expect.any(Function)
  )
})

test('shows progress while a cached model initializes', async () => {
  const engine = {
    unload: jest.fn().mockResolvedValue(),
    resetChat: jest.fn().mockResolvedValue()
  }
  let finishLoading
  mockIsModelCached.mockImplementation((model) =>
    Promise.resolve(model.key === 'qwen3-1.7b')
  )
  mockLoadWebLLM.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLoading = () => resolve(engine)
      })
  )

  render(<Assistant />)

  expect(await screen.findByText('Loading Qwen3 1.7B')).toBeTruthy()

  await act(async () => finishLoading())
  expect(await screen.findByText('Qwen3 1.7B ready')).toBeTruthy()
})

test('shows raw generations only when expanded', () => {
  render(
    <ChatBubble
      message={{
        role: 'assistant',
        content: 'The structured response failed.',
        rawGenerations: [
          { phase: 'action', content: 'raw repeated output' }
        ]
      }}
    />
  )

  expect(screen.queryByText('raw repeated output')).toBeNull()
  fireEvent.press(
    screen.getByRole('button', { name: 'Show raw generation' })
  )
  expect(screen.getByText('raw repeated output')).toBeTruthy()
})
