import React from 'react'
import { act, render, screen, waitFor } from 'test-utils'

import { pfwAPI, saveLogin } from 'api'
import PFW from 'views/Firewall/Pfw'
//import FlowList from 'components/Flow/FlowList'
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
    const utils = render(<PFW />)

    // wait for data to be populated
    await waitFor(() => expect(screen.getByDisplayValue('213.24.76.23')).toBeTruthy())
  })

  test('api', async () => {
    let config = await pfwAPI.config()
    expect(config.BlockRules.length).toBeGreaterThan(0)
  })

  test('Add flow', async () => {
    const utils = render(<PFW />)
    expect(screen.getByDisplayValue('NewFlow')).toBeTruthy()
  })
})
