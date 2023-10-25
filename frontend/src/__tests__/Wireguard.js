import React from 'react'

import { act, render, screen, fireEvent, waitFor } from 'test-utils'

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

describe('Wireguard', () => {
  test('Peer list', async () => {
    const utils = render(<PeerList />)

    expect(screen.getByText('Peers')).toBeTruthy()
    expect(await screen.findByText('192.168.3.2/32')).not.toBeNull()
  })

  /*test('Add peer', async () => {
    let config = { listenPort: 51280 }
    let notifyChange = jest.fn()
    let endpoints = []

    render(
      <WireguardAddPeer
        config={config}
        notifyChange={notifyChange}
        defaultEndpoints={endpoints}
      />
    )

    expect(await screen.findByText('Client')).toBeTruthy()
    //expect(screen.getByPlaceholderText('base64 pubkey')).toBeTruthy()


    fireEvent(await screen.findByText('Save'), 'pressIn')
    fireEvent(await screen.findByText('Save'), 'pressOut')

    await waitFor(() => {
      expect(notifyChange).toHaveBeenCalled()
    })
   
  })*/
})
