import React from 'react'
import { render, screen, waitFor } from 'test-utils'
import {
  fireEvent,
  waitForElementToBeRemoved
} from '@testing-library/react-native'
import { MemoryRouter } from 'react-router-dom'

import DNSHostnames from 'views/DNS/DNSHostnames'
import { saveLogin } from 'api'
import MockAPI from 'api/MockAPI'

beforeAll(() => {
  saveLogin('admin', 'admin')
  // answer mock requests immediately so the waits below only cover rendering
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
  test('lists records and lets every row be edited', async () => {
    await setup()

    expect(screen.getByText('Set lan DNS entries')).toBeTruthy()
    expect(screen.getByText('rpi4.lan')).toBeTruthy()
    expect(screen.getByText('vault.home.example.com')).toBeTruthy()
    expect(screen.getByText('Device rpi4')).toBeTruthy()
    for (let hostname of ['rpi4.lan', 'laptop.lan', 'printer.lan']) {
      expect(screen.getByLabelText(`Edit ${hostname}`)).toBeTruthy()
      expect(screen.getByLabelText(`Delete ${hostname}`)).toBeTruthy()
    }
    expect(screen.queryByText('Pinned')).toBeNull()
  })

  test('adds a .lan name and refuses reserved names', async () => {
    await setup()

    fireEvent.press(screen.getByText('Add Hostname'))
    await waitFor(() => expect(screen.getByPlaceholderText('nas')).toBeTruthy())
    expect(screen.queryByText(/A name without a domain/)).toBeNull()

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

  test('editing a device row pins it until reset', async () => {
    await setup()

    fireEvent.press(screen.getByLabelText('Edit rpi4.lan'))
    await waitFor(() =>
      expect(screen.getByDisplayValue('192.168.2.101')).toBeTruthy()
    )
    fireEvent.changeText(
      screen.getByDisplayValue('192.168.2.101'),
      '192.168.2.150'
    )
    fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByText('192.168.2.150')).toBeTruthy())
    expect(screen.getByLabelText('Reset rpi4.lan')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Reset rpi4.lan'))
    await waitFor(() => expect(screen.getByText('192.168.2.101')).toBeTruthy())
    expect(screen.queryByLabelText('Reset rpi4.lan')).toBeNull()
  })

  test('deleting a row keeps it removed until reset', async () => {
    await setup()

    fireEvent.press(screen.getByLabelText('Delete laptop.lan'))
    await waitFor(() => expect(screen.getByText('Removed')).toBeTruthy())
    expect(screen.queryByLabelText('Edit laptop.lan')).toBeNull()

    fireEvent.press(screen.getByLabelText('Reset laptop.lan'))
    await waitFor(() => expect(screen.getByText('192.168.2.102')).toBeTruthy())
    expect(screen.queryByText('Removed')).toBeNull()
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
    await waitFor(() => expect(screen.getByText('192.168.2.111')).toBeTruthy())

    fireEvent.press(screen.getByLabelText('Delete printer.lan'))
    await waitFor(() => expect(screen.getByText('Removed')).toBeTruthy())

    fireEvent.press(screen.getByLabelText('Reset printer.lan'))
    // a row leaving the FlatList takes about 2s to drop out of the rendered
    // tree under waitFor, so give removal plenty of room on slow CI runners
    await waitForElementToBeRemoved(() => screen.queryByText('printer.lan'), {
      timeout: 10000
    })
  }, 20000)
})
