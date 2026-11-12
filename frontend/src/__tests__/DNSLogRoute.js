import React from 'react'
import { render, screen, waitFor } from 'test-utils'
import { fireEvent } from '@testing-library/react-native'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import DNSLog from 'views/DNS/DNSLog'
import { saveLogin } from 'api'
import MockAPI from 'api/MockAPI'

beforeAll(() => {
  saveLogin('admin', 'admin')
  MockAPI().timing = 0
})

let location = null
const CurrentLocation = () => {
  location = useLocation()
  return null
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CurrentLocation />
      <Routes>
        <Route path="/admin/dnsLog/:ips/:text" element={<DNSLog />} />
      </Routes>
    </MemoryRouter>
  )

// the search input renders inside a tab scene the testing library treats as hidden
const hidden = { includeHiddenElements: true }

describe('DNS log all clients', () => {
  test('no client in the URL shows recent queries from every client', async () => {
    renderAt('/admin/dnsLog/:ips/:text')

    expect(await screen.findByText('ads.example.com.', hidden)).toBeTruthy()
    expect(screen.getByText('apple.com.', hidden)).toBeTruthy()
    expect(
      screen.getByText('Most recent queries from all clients', hidden)
    ).toBeTruthy()
    expect(location.pathname).toBe('/admin/dnsLog/:ips/:text')
  })

  test('pressing a client narrows the log to that client', async () => {
    renderAt('/admin/dnsLog/:ips/:text')

    const client = await screen.findAllByText(/192\.168\.2\.102/, hidden)
    fireEvent.press(client[0])

    await waitFor(() =>
      expect(location.pathname).toBe('/admin/dnsLog/192.168.2.102/:text')
    )
  })
})

describe('DNS log search URL', () => {
  test('a slash in the search text survives the route', async () => {
    renderAt('/admin/dnsLog/192.168.1.42,192.168.1.26/a%2Fb')
    await waitFor(() =>
      expect(screen.getByDisplayValue('a/b', hidden)).toBeTruthy()
    )
  })

  test('typing a slash keeps the page on the dnsLog route', async () => {
    renderAt('/admin/dnsLog/192.168.1.42,192.168.1.26/:text')
    const input = await screen.findByPlaceholderText('Filter domain...', hidden)

    fireEvent.changeText(input, 'example.com/path')

    await waitFor(() =>
      expect(location.pathname).toBe(
        '/admin/dnsLog/192.168.1.42,192.168.1.26/example.com%2Fpath'
      )
    )
    expect(screen.getByDisplayValue('example.com/path', hidden)).toBeTruthy()
  })
})
