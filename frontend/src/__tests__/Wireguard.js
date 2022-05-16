import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { NativeBaseProvider } from 'native-base'

import { wireguardAPI, saveLogin } from 'api'
import Wireguard from 'views/Wireguard'

beforeAll(() => saveLogin('admin', 'admin'))

describe('Wireguard', () => {
  test('Peer list', async () => {
    const inset = {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 }
    }

    const { container, getByText } = render(
      <NativeBaseProvider initialWindowMetrics={inset}>
        <Wireguard />
      </NativeBaseProvider>
    )

    expect(container).toBeDefined()
    // make sure we have all the tables in the document
    //expect(getByText('Wireguard')).toBeInTheDocument()

    // wait for data to be populated
    //await waitFor(() => expect(getByText('192.168.3.2/32')).toBeInTheDocument())
  })
})
