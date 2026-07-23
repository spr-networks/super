import React from 'react'
import { fireEvent, render, waitFor } from 'test-utils'

import { AlertContext } from 'AppContext'
import InstallPlugin from 'components/Plugins/InstallPlugin'
import { api } from 'api'

jest.mock('api', () => ({
  api: {
    put: jest.fn()
  }
}))

global.sessionStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null
  },
  setItem(key, value) {
    this.data[key] = value
  },
  removeItem(key) {
    delete this.data[key]
  },
  clear() {
    this.data = {}
  }
}

describe('plugin installation trust confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
    window.addEventListener = jest.fn()
    window.removeEventListener = jest.fn()
  })

  it('confirms an unsandboxed UI before completing installation', async () => {
    const plugin = {
      Name: 'spr-hermes',
      URI: 'spr-hermes',
      GitURL: 'https://github.com/spr-networks/spr-hermes',
      HasUI: true,
      SandboxedUI: false
    }
    api.put.mockImplementation((path) => {
      if (path === '/plugin/download_info') {
        return Promise.resolve(plugin)
      }
      return Promise.resolve()
    })

    const alerts = {
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    }
    const screen = render(
      <AlertContext.Provider value={alerts}>
        <InstallPlugin />
      </AlertContext.Provider>
    )

    fireEvent.changeText(
      screen.getByPlaceholderText(
        'https://github.com/spr-networks/spr-sample-plugin.git'
      ),
      plugin.GitURL
    )
    fireEvent.press(screen.getByText('Add Plugin'))

    await waitFor(() =>
      expect(screen.getByText('Plugin UI has full API access')).toBeTruthy()
    )
    expect(api.put).not.toHaveBeenCalledWith('/plugin/complete_install', plugin)

    fireEvent.press(screen.getByText('Install with full API access'))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/plugin/complete_install', plugin)
    )
    screen.unmount()
  })
})
