import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from 'test-utils'

import {
  NativeRouter as Router,
  Route,
  Routes,
  MemoryRouter
} from 'react-router-native'

import AuthLayout from 'layouts/Auth'
import UplinkConfiguration from 'views/LinkConfiguration/UplinkConfiguration'

import createServer from 'api/MockAPI'
let server

beforeAll(() => {
  server = createServer({ isSetup: false })
})

afterEach(cleanup)

const setup = async () => {
  const utils = render(
    <Router>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="*" element={<UplinkConfiguration />} />
        </Route>
      </Routes>
    </Router>
  )

  // Wait for the component to load
  await waitFor(
    () => {
      expect(screen.getByText('Uplink Configuration')).toBeTruthy()
    },
    { timeout: 3000 }
  )

  return utils
}

jest.useFakeTimers()

describe('UplinkConfiguration', () => {
  test('renders uplink configuration page', async () => {
    await setup()

    expect(screen.getByText('Uplink Configuration')).toBeTruthy()
    expect(screen.getByText('Other Interfaces')).toBeTruthy()
  })

  test('handles interfaces with IPv6 addresses without crashing', async () => {
    // BUG TEST: This test catches the IPv6 bug in truncateSupernetIps()
    //
    // The mock API returns eth0.123 with 3 IPs:
    // - 192.168.99.99 (IPv4)
    // - fd00:1234:5678:2:aabb:ccff:fedd:eeff (IPv6)
    // - 2001:db8:1234:5678:aabb:ccff:fedd:eeff (IPv6)
    //
    // When there are 3+ IPs, truncateSupernetIPs() is called which
    // incorrectly uses new Address4() on ALL IPs including IPv6 addresses.
    // This throws: AddressError: Invalid IPv4 address.
    //
    // FIX: Filter out IPv6 addresses before calling new Address4()
    // or use Address6 for IPv6 addresses

    await setup()

    await waitFor(
      () => {
        // eth0.123 should be displayed
        expect(screen.getByText('eth0.123')).toBeTruthy()

        // IPv6 addresses should be visible without crashing
        // Currently this will fail with AddressError at line 775
        const ipv4 = screen.queryByText('192.168.99.99')
        expect(ipv4).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })
})
