import React from 'react'
import { render, screen, waitFor } from 'test-utils'
import { fireEvent } from '@testing-library/react-native'
import { MemoryRouter } from 'react-router-dom'

import DNSHostnames from 'views/DNS/DNSHostnames'
import { saveLogin } from 'api'
import MockAPI from 'api/MockAPI'

beforeAll(() => {
  saveLogin('admin', 'admin')
  // answer mock requests immediately: each add/edit/delete waits on a
  // write and a list refresh, and the default 400ms per request is what
  // pushed the delete check past its timeout on slower CI runners
  MockAPI().timing = 0
})

const setup = async () => {
  const utils = render(
    <MemoryRouter>
      <DNSHostnames />
    </MemoryRouter>
  )
  await waitFor(() => expect(screen.getByText('printer.lan')).toBeTruthy())
  return utils
}

describe('DNS Hostnames', () => {
  test('lists records and protects names that come from devices', async () => {
    await setup()

    expect(screen.getByText('rpi4.lan')).toBeTruthy()
    expect(screen.getByText('vault.home.example.com')).toBeTruthy()
    expect(screen.getByText(/From the name of device rpi4/)).toBeTruthy()
    expect(screen.queryByLabelText('Edit rpi4.lan')).toBeNull()
    expect(screen.queryByLabelText('Delete rpi4.lan')).toBeNull()
    expect(screen.getByLabelText('Edit printer.lan')).toBeTruthy()
    expect(screen.getByLabelText('Delete printer.lan')).toBeTruthy()
  })

  test('adds a .lan name and refuses reserved names', async () => {
    await setup()

    fireEvent.press(screen.getByText('Add Hostname'))
    await waitFor(() => expect(screen.getByPlaceholderText('nas')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('nas'), 'spr')
    fireEvent.changeText(
      screen.getByPlaceholderText('192.168.2.50'),
      '192.168.2.50'
    )
    fireEvent.press(screen.getByText('Save'))
    expect(screen.getByText('This name is reserved for SPR')).toBeTruthy()

    fireEvent.changeText(screen.getByPlaceholderText('nas'), 'NAS')
    expect(screen.getByText('Resolves as nas.lan')).toBeTruthy()
    fireEvent.press(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByText('nas.lan')).toBeTruthy(), {
      timeout: 3000
    })
    expect(screen.getByText('192.168.2.50')).toBeTruthy()
  })

  test('edits the address of a record and deletes it', async () => {
    await setup()

    fireEvent.press(screen.getByLabelText('Edit printer.lan'))
    await waitFor(() =>
      expect(screen.getByDisplayValue('192.168.2.110')).toBeTruthy()
    )
    fireEvent.changeText(
      screen.getByDisplayValue('192.168.2.110'),
      '192.168.2.111'
    )
    fireEvent.press(screen.getByText('Save'))
    await waitFor(
      () => expect(screen.getByText('192.168.2.111')).toBeTruthy(),
      {
        timeout: 3000
      }
    )

    fireEvent.press(screen.getByLabelText('Delete printer.lan'))
    await waitFor(() => expect(screen.queryByText('printer.lan')).toBeNull(), {
      timeout: 3000
    })
  })
})
