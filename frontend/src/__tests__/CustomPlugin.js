import React from 'react'
import TestRenderer from 'react-test-renderer'

import CustomPlugin from '../components/Plugins/CustomPlugin.web'

describe('plugin iframe sandboxing', () => {
  let messageHandler

  beforeAll(() => {
    window.addEventListener = jest.fn((event, handler) => {
      if (event === 'message') {
        messageHandler = handler
      }
    })
    window.removeEventListener = jest.fn()
  })

  it('sandboxes the iframe by default', () => {
    let renderer
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<CustomPlugin srcDoc="<html />" />)
    })
    const iframe = renderer.root.findByType('iframe')

    expect(iframe.props.sandbox).toBe('allow-scripts')
    TestRenderer.act(() => renderer.unmount())
  })

  it('allows an explicit sandbox opt-out', () => {
    let renderer
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <CustomPlugin srcDoc="<html />" isSandboxed={false} />
      )
    })
    const iframe = renderer.root.findByType('iframe')

    expect(iframe.props.sandbox).toBeUndefined()
    TestRenderer.act(() => renderer.unmount())
  })

  it('rekeys only the iframe that requested plugin authentication', async () => {
    const contentWindow = { postMessage: jest.fn() }
    const nextAuth = {
      token: 'sprui1_new',
      expiresAt: Date.now() + 600000,
      protocolVersion: 1
    }
    const onAuthRequired = jest.fn(() => Promise.resolve(nextAuth))
    let renderer
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        <CustomPlugin
          srcDoc="<html />"
          pluginAuth={nextAuth}
          onAuthRequired={onAuthRequired}
        />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow } : null
        }
      )
    })

    await TestRenderer.act(async () => {
      messageHandler({
        source: contentWindow,
        data: JSON.stringify({
          type: 'spr:auth-required',
          protocolVersion: 1,
          requestId: 'refresh-1'
        })
      })
      await Promise.resolve()
    })

    expect(onAuthRequired).toHaveBeenCalledTimes(1)
    expect(contentWindow.postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'spr:auth',
        token: nextAuth.token,
        expiresAt: nextAuth.expiresAt,
        protocolVersion: 1,
        requestId: 'refresh-1'
      }),
      '*'
    )

    await TestRenderer.act(async () => {
      messageHandler({
        source: { postMessage: jest.fn() },
        data: JSON.stringify({
          type: 'spr:auth-required',
          protocolVersion: 1,
          requestId: 'other-frame'
        })
      })
    })
    expect(onAuthRequired).toHaveBeenCalledTimes(1)
    TestRenderer.act(() => renderer.unmount())
  })
})
