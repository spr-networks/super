import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from 'test-utils'

import {
  NativeRouter as Router,
  Route,
  Routes,
  MemoryRouter
} from 'react-router-native'

import AuthLayout from 'layouts/Auth'
import Setup from 'views/pages/Setup'
import AddDevice from 'components/Setup/AddDevice'

//import { saveLogin } from 'api'

import createServer from 'api/MockAPI'
let server

beforeAll(() => {
  server = createServer({ isSetup: true })
  //saveLogin('admin', 'admin')
})

const setup = async () => {
  const utils = render(
    <Router>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="*" element={<Setup />} />
        </Route>
      </Routes>
    </Router>
  )

  await waitFor(() =>
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1)
  )

  return utils
}

jest.useFakeTimers()

describe('Setup', () => {
  test('stage 0', async () => {
    await setup()

    expect(screen.getByText('Welcome to SPR!')).toBeTruthy()
  })

  test('stage 0 - Check', async () => {
    await setup()

    //polling every 2s, make sure both are fetched
    await waitFor(
      () => {
        expect(screen.getByText('Network cable connected')).toBeTruthy()
        expect(screen.getByText('Wifi card detected')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  test('stage 1 - Config', async () => {
    await setup()

    let btnStart = screen.getByRole('button', { name: 'Start' })
    await waitFor(
      () => {
        expect(btnStart).toBeTruthy()
      },
      { timeout: 3000 }
    )

    fireEvent.press(btnStart)

    expect(screen.getByText('Wifi Country Code')).toBeTruthy()
    expect(screen.getByText('Admin Password')).toBeTruthy()

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
      },
      { timeout: 3000 }
    )

    let btnSave = screen.getByRole('button', { name: 'Save' })
    fireEvent.press(btnSave)

    expect(
      screen.getByText('Password needs to be at least 5 characters')
    ).toBeTruthy()

    const inputPassword = screen.getByPlaceholderText('Password')
    const inputPasswordConfirm = screen.getByPlaceholderText('Confirm Password')

    expect(inputPassword).toBeTruthy()

    fireEvent.changeText(inputPassword, 'password1')
    fireEvent.changeText(inputPasswordConfirm, 'password2')

    fireEvent.press(btnSave)

    expect(screen.getByText('Password confirmation mismatch')).toBeTruthy()

    fireEvent.changeText(inputPasswordConfirm, 'password1')

    fireEvent.press(btnSave)

    await waitFor(
      () => {
        expect(screen.getByText('Add Your First WiFi Device')).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })

  test('stage 2 - Add Device', async () => {
    const deviceAdded = jest.fn()
    const onClose = jest.fn()
    const onDeviceConnect = jest.fn()
    let ssidUp = true

    const utils = render(
      <Router>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route
              path="*"
              element={
                <AddDevice
                  deviceAddedCallback={deviceAdded}
                  onClose={onClose}
                  onConnect={onDeviceConnect}
                  disabled={!ssidUp}
                />
              }
            />
          </Route>
        </Routes>
      </Router>
    )

    expect(onClose).toHaveBeenCalledTimes(0)
    expect(onDeviceConnect).toHaveBeenCalledTimes(0)

    let btnAdd = screen.getByRole('button', { name: 'Add Device' })
    let btnSkip = screen.getByRole('button', { name: 'Skip' })

    expect(btnAdd).toBeTruthy()

    expect(screen.getByLabelText('Input Field')).toBeTruthy()

    fireEvent.press(btnSkip)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDeviceConnect).toHaveBeenCalledTimes(0)

    fireEvent.press(btnAdd)

    //mock will show device as connected, just wait for it to be called

    await waitFor(
      () => {
        expect(screen.getByText('Now connect your device')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Success' })).toBeTruthy()

        expect(onDeviceConnect).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 }
    )

    //=> stage3
    //TODO /hostapd/restart_setup call
  })
})
