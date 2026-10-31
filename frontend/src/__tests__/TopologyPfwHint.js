import React from 'react'
import { render, screen } from 'test-utils'
import { fireEvent } from '@testing-library/react-native'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppContext } from 'AppContext'
import { DetailPanel } from 'components/Topology/topologyUI'

let location = null
const CurrentLocation = () => {
  location = useLocation()
  return null
}

const device = {
  ID: 'dev:aa:bb:cc:dd:ee:ff',
  Kind: 'device',
  MAC: 'aa:bb:cc:dd:ee:ff',
  IP: '192.168.2.101',
  Name: 'rpi4',
  Online: true
}

const sinks = [
  {
    ID: 'plugin:usque:sink:warp',
    Kind: 'sink',
    Name: 'Cloudflare WARP',
    IP: '172.30.118.2',
    Iface: 'spr-usque'
  }
]

const renderPanel = (pfwAvailable, isPlusDisabled) =>
  render(
    <AppContext.Provider value={{ isPlusDisabled, getDevice: () => null }}>
      <MemoryRouter initialEntries={['/admin/topology']}>
        <CurrentLocation />
        <DetailPanel
          node={device}
          peers={{
            isolated: false,
            canReach: [],
            reachableFrom: [],
            endpoints: []
          }}
          options={{}}
          sinks={sinks}
          routes={[]}
          pfwAvailable={pfwAvailable}
          onAddRoute={() => {}}
          onRemoveRoute={() => {}}
        />
      </MemoryRouter>
    </AppContext.Provider>
  )

describe('Topology PFW hint', () => {
  test('links to enabling PFW when PFW is not running', () => {
    renderPanel(false, true)

    expect(screen.getByText(' to route devices through plugins.')).toBeTruthy()
    fireEvent.press(screen.getByText('Enable PFW'))
    expect(location.pathname).toBe('/admin/plugins')
  })

  test('shows no hint while PFW is running', () => {
    renderPanel(true, false)

    expect(screen.queryByText('Enable PFW')).toBeNull()
  })
})
