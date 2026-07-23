import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { render, screen, waitFor } from 'test-utils'
import { blockAPI, deviceAPI } from 'api'
import DeviceView from 'views/Devices/Device'

jest.mock('components/Devices/EditDevice', () => {
  const React = require('react')
  const { Text } = require('@gluestack-ui/themed')

  return ({ device }) =>
    React.createElement(Text, null, `${device.Name} ${device.MAC}`)
})

describe('container device detail', () => {
  it('loads a container by its MAC instead of relying on the response map key', async () => {
    deviceAPI.list = jest.fn().mockResolvedValue({
      'plugin-atlas': {
        Name: 'spr-atlas',
        Type: 'Container',
        MAC: '02:53:50:52:4b:13',
        Groups: null,
        Policies: null,
        DeviceTags: null,
        PSKEntry: null,
        Style: null
      }
    })
    deviceAPI.oui = jest.fn()
    blockAPI.blocklists = jest.fn().mockResolvedValue([])

    render(
      <MemoryRouter
        initialEntries={['/admin/devices/02:53:50:52:4B:13']}
      >
        <Routes>
          <Route path="/admin/devices/:id" element={<DeviceView />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('spr-atlas 02:53:50:52:4b:13')
      ).toBeTruthy()
    })
    expect(deviceAPI.oui).not.toHaveBeenCalled()
  })
})
