import React from 'react'
import { NativeBaseProvider } from 'native-base'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

import { WifiClients } from 'components/Dashboard/WifiWidgets'

describe('Widgets', () => {
  test('test num clients', async () => {
    const inset = {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 }
    }

    const component = (
      <NativeBaseProvider initialWindowMetrics={inset}>
        <WifiClients iface="wlan0"/>
      </NativeBaseProvider>
    )

    const { container, getByText } = render(component)
    expect(container).toBeDefined()
    const header = await getByText('Active WiFi Clients')
    expect(header).toBeTruthy()
  })
})
