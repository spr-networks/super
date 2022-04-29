import React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved
} from '@testing-library/react'
import { within } from '@testing-library/dom'

import { wireguardAPI, saveLogin } from 'api'
import Wireguard from 'views/Wireguard'

beforeAll(() => saveLogin('admin', 'admin'))

describe('Wireguard', () => {
  let container = null

  beforeEach(() => {
    container = render(<Wireguard />)
  })

  test('Peer list', async () => {
    // make sure we have all the tables in the document
    expect(screen.getByText('Wireguard')).toBeInTheDocument()

    // wait for data to be populated
    await waitFor(() =>
      expect(screen.getByText('192.168.3.2/32')).toBeInTheDocument()
    )
  })
})
