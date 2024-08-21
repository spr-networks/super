import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from 'test-utils'

import {
  NativeRouter as Router,
  Route,
  Routes,
  MemoryRouter
} from 'react-router-native'

import AdminLayout from 'layouts/Admin'
import Devices from 'views/Devices/Devices'
//import DeviceList from 'components/Devices/DeviceList'
import { deviceAPI, saveLogin } from 'api'

beforeAll(() => saveLogin('admin', 'admin'))

const setup = async () => {
  const toggleColorMode = () => {
    setColorMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const utils = render(
    <Router>
      <Routes>
        <Route element={<AdminLayout toggleColorMode={toggleColorMode} />}>
          <Route path="*" element={<Devices />} />
        </Route>
      </Routes>
    </Router>
  )

  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { expanded: false }).length
    ).toBeGreaterThanOrEqual(5)
  )

  return utils
}

//FIX ReferenceError: You are trying to `import` a file after the Jest environment has been torn down.
jest.useFakeTimers()

describe('Device List', () => {
  test('todo', () => {
    return
  })
  /*
  test('show devices', async () => {
    await setup()

    expect(screen.getByText('Add Device')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('rpi4')).toBeTruthy()
      expect(screen.getByText('192.168.2.101')).toBeTruthy()
    })
  })

  test('expand menu', async () => {
    await setup()

    let expandbtn = screen.getAllByRole('button', { expanded: false })[1]
    fireEvent.press(expandbtn)

    expect(screen.getByText('Duplicate')).toBeTruthy()
    expect(screen.getByText('Show password')).toBeTruthy()

    //NOTE multiple with native
    expect(screen.queryAllByText('Edit')).toBeTruthy()
    expect(screen.queryAllByText('Delete')).toBeTruthy()
  })

  test('filter devices', async () => {
    await setup()

    //track num devices by the ...-edit button for each listItem
    let numItems = screen.getAllByRole('button', { expanded: false }).length
    expect(numItems).toBeGreaterThanOrEqual(5)

    let filterbtn = screen.getByRole('button', { name: 'Groups and tags' })

    fireEvent.press(filterbtn)

    //filter by group - first item is showall, rest tags and groups
    fireEvent.press(screen.getAllByRole('menuitem')[1])

    let numItemsFiltered = screen.getAllByRole('button', {
      expanded: false
    }).length

    expect(numItemsFiltered).toBeLessThan(numItems)

    //disable filter - show all, note text value == first_group
    fireEvent.press(filterbtn)
    fireEvent.press(screen.getAllByRole('menuitem')[0]) // Show All

    let numItemsReset = screen.getAllByRole('button', {
      expanded: false
    }).length
    expect(numItemsReset).toEqual(numItems)
  })
  */
})
