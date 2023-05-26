import React from 'react'
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor
} from '@testing-library/react-native'
import { NativeBaseProvider } from 'native-base'

import { wireguardAPI, saveLogin } from 'api'
import Wireguard from 'views/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import WireguardAddPeer from 'components/Wireguard/WireguardAddPeer'
import createServer from 'api/MockAPI'

let server

beforeAll(() => {
  server = createServer()
  saveLogin('admin', 'admin')
})

afterAll(() => {
  server.shutdown()
})

const inset = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 }
}

describe('Wireguard', () => {
  test('Peer list', async () => {
    render(
      <NativeBaseProvider initialWindowMetrics={inset}>
        <PeerList />
      </NativeBaseProvider>
    )

    await act(async () => {
      expect(screen.getByText('Peers')).toBeTruthy()

      expect(await screen.findByText('192.168.3.2/32')).not.toBeNull()
    })
  })

  /*
  test('Add peer', async () => {
    let config = { listenPort: 51280 }
    let notifyChange = jest.fn()

    render(
      <NativeBaseProvider initialWindowMetrics={inset}>
        <WireguardAddPeer config={config} notifyChange={notifyChange} />
      </NativeBaseProvider>
    )
    await act(async () => {
      expect(await screen.findByText('Client')).toBeTruthy()
      fireEvent(await screen.findByText('Save'), 'pressIn')
      fireEvent(await screen.findByText('Save'), 'pressOut')

      await waitFor(() => {
        expect(notifyChange).toHaveBeenCalled()
      })
    })
  })
  */
})
