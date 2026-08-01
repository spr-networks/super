import 'react-native'
import React from 'react'
import { render, waitFor } from 'test-utils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CustomPluginView from 'views/CustomPlugin'
import { api, getJWTOTPHeader, pluginAPI } from 'api'

jest.mock('api', () => ({
  api: {
    getAuthHeaders: jest.fn(() => Promise.resolve('Bearer test-token')),
    getApiURL: jest.fn(() => 'http://localhost/'),
    remoteURL: '',
    put: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve())
  },
  getJWTOTPHeader: jest.fn(() => null),
  pluginAPI: {
    list: jest.fn()
  }
}))

const plugin = {
  Name: 'spr-sample',
  URI: 'spr-sample',
  HasUI: true,
  SandboxedUI: false
}

const renderPlugin = () =>
  render(
    <MemoryRouter initialEntries={['/spr-sample']}>
      <Routes>
        <Route path="/:name" element={<CustomPluginView />} />
      </Routes>
    </MemoryRouter>
  )

describe('plugin UI fetch with OTP enabled', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    pluginAPI.list.mockResolvedValue([plugin])
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve('<html><head></head><body>plugin</body></html>')
      })
    )
  })

  // regression: getPluginHTML sent only Authorization, so OTP-enabled
  // sessions got a 302 to /auth/validate instead of the plugin UI
  it('sends the X-JWT-OTP header when an OTP JWT is present', async () => {
    getJWTOTPHeader.mockReturnValue('otp-jwt')

    const screen = renderPlugin()

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('plugins/spr-sample/')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
    expect(opts.headers['X-JWT-OTP']).toBe('otp-jwt')

    screen.unmount()
  })

  it('omits the header without an OTP JWT', async () => {
    getJWTOTPHeader.mockReturnValue(null)

    const screen = renderPlugin()

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.headers['X-JWT-OTP']).toBeUndefined()

    screen.unmount()
  })
})
