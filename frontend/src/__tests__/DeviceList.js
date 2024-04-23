import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from 'test-utils'

import {
  NativeRouter as Router,
  Route,
  Routes,
  MemoryRouter
} from 'react-router-native'
//import { BrowserRouter, Router } from 'react-router-dom'

import AdminLayout from 'layouts/Admin'
import Devices from 'views/Devices/Devices'
//import DeviceList from 'components/Devices/DeviceList'
import createServer from 'api/MockAPI'
import { deviceAPI, saveLogin } from 'api'
import { Platform } from 'react-native'

let server

beforeAll(() => {
  server = createServer()
  saveLogin('admin', 'admin')
})

afterAll(() => {
  server.shutdown()
})

afterEach(cleanup)

//FIX ReferenceError: You are trying to `import` a file after the Jest environment has been torn down.
jest.useFakeTimers()

it('show devices', async () => {
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

  expect(screen.getByText('Add Device')).toBeTruthy()

  await waitFor(() => {
    expect(screen.getByText('rpi4')).toBeTruthy()
    expect(screen.getByText('192.168.2.101')).toBeTruthy()
  })
})
