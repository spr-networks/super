import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { NativeBaseProvider } from 'native-base'

import { pfwAPI, saveLogin } from 'api'
import FlowList from 'components/Flow/FlowList'
import PFW from 'views/Pfw'
import createServer from 'api/MockAPI'

let server

beforeAll(() => {
  server = createServer()
  saveLogin('admin', 'admin')
})

afterAll(() => {
  server.shutdown()
})

describe('PFW', () => {
  test('Flow list', async () => {
    const inset = {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 }
    }

    act(async () => {
      const { container, getByText } = render(
        <NativeBaseProvider initialWindowMetrics={inset}>
          <PFW />
        </NativeBaseProvider>
      )

      await waitFor(() => {
        expect(container).toBeDefined()
      })

      expect(screen.getByText('Flows')).toBeTruthy()
    })

    // wait for data to be populated
    //await waitFor(() => expect(getByText('192.168.3.2/32')).toBeInTheDocument())
  })

  test('api', async () => {
    let config = await pfwAPI.config()
    expect(config.BlockRules.length).toBeGreaterThan(0)
  })
})
