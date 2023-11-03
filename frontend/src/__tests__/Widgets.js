import React from 'react'
import { render, screen } from 'test-utils'

import { WifiClients } from 'components/Dashboard/WifiWidgets'

describe('Wifi Widgets', () => {
  test('test num wifi clients', async () => {
    const utils = render(<WifiClients iface="wlan0" />)
    expect(screen.getByText('Active WiFi Clients')).toBeTruthy()
  })
})
