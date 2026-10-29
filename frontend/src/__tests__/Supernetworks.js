import 'react-native'
import React from 'react'
import { Response } from 'miragejs'
import { MemoryRouter } from 'react-router-native'
import { fireEvent, render, screen, waitFor } from 'test-utils'

import { AlertContext, AppContext } from 'AppContext'
import { deviceAPI, saveLogin } from 'api'
import createServer from 'api/MockAPI'
import DHCPPage from 'views/Supernetworks'

let server
let devices = {}
let dhcpConfig
let savedBodies

const initialConfig = () => ({
  TinyNets: ['192.168.2.0/24', '192.168.4.0/24'],
  LeaseTime: '24h0m0s'
})

const pressEvent = () => {
  const target = {}
  target.__reactFiber = { stateNode: target }
  return { nativeEvent: {}, target, currentTarget: target }
}

const press = (element) => fireEvent.press(element, pressEvent())

beforeAll(async () => {
  server = createServer()
  await saveLogin('admin', 'admin')

  server.get('/subnetConfig', () => dhcpConfig)
  server.put('/subnetConfig', (schema, request) => {
    const conf = JSON.parse(request.requestBody)
    savedBodies.push(conf)

    if (!Array.isArray(conf.TinyNets) || conf.TinyNets.length == 0) {
      return new Response(400, {}, 'Need at least one subnet')
    }
    for (const subnet of conf.TinyNets) {
      if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(subnet)) {
        return new Response(400, {}, 'Invalid subnet in TinyNets')
      }
    }
    if (conf.LeaseTime == '') {
      conf.LeaseTime = dhcpConfig.LeaseTime
    } else if (!/^(\d{1,2})h(\d{1,2})m(\d{1,2})s$/.test(conf.LeaseTime)) {
      return new Response(400, {}, 'Invalid lease time')
    }

    dhcpConfig = conf
    return conf
  })

  devices = await deviceAPI.list()
})

afterAll(() => {
  server.shutdown()
})

beforeEach(() => {
  dhcpConfig = initialConfig()
  savedBodies = []
})

const renderPage = async () => {
  const alerts = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn()
  }
  const appContext = {
    devices: Object.values(devices),
    getDevice: (value, key = 'MAC') =>
      Object.values(devices).find((device) => device[key] == value) || null
  }

  const utils = render(
    <MemoryRouter>
      <AppContext.Provider value={appContext}>
        <AlertContext.Provider value={alerts}>
          <DHCPPage />
        </AlertContext.Provider>
      </AppContext.Provider>
    </MemoryRouter>
  )

  await waitFor(() => expect(screen.getByDisplayValue('24h0m0s')).toBeTruthy())
  return { ...utils, alerts }
}

const expectSaved = async (alerts, expected) => {
  await waitFor(() =>
    expect(alerts.success).toHaveBeenCalledWith('Updated supernetworks')
  )
  expect(alerts.error).not.toHaveBeenCalled()
  expect(savedBodies).toEqual([expected])
  expect(dhcpConfig).toEqual(expected)
  await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
}

describe('DHCP page', () => {
  describe('DHCP Settings tab', () => {
    it('shows the saved subnets and lease time', async () => {
      const { alerts } = await renderPage()

      expect(screen.getByText('DHCP Settings')).toBeTruthy()
      expect(screen.getByText('DHCP Table')).toBeTruthy()
      expect(screen.getByDisplayValue('192.168.2.0/24')).toBeTruthy()
      expect(screen.getByDisplayValue('192.168.4.0/24')).toBeTruthy()
      expect(screen.getByText('Save')).toBeTruthy()
      expect(alerts.error).not.toHaveBeenCalled()
    })

    it('does not save until something changes', async () => {
      await renderPage()

      press(screen.getByText('Save'))

      expect(savedBodies).toEqual([])
    })

    it('saves an edited lease time', async () => {
      const { alerts } = await renderPage()

      fireEvent.changeText(screen.getByDisplayValue('24h0m0s'), '12h0m0s')
      press(screen.getByText('Save unsaved changes'))

      await expectSaved(alerts, {
        TinyNets: ['192.168.2.0/24', '192.168.4.0/24'],
        LeaseTime: '12h0m0s'
      })
      expect(screen.getByDisplayValue('12h0m0s')).toBeTruthy()
    })

    it('saves an edited subnet', async () => {
      const { alerts } = await renderPage()

      fireEvent.changeText(
        screen.getByDisplayValue('192.168.4.0/24'),
        '192.168.8.0/24'
      )
      press(screen.getByText('Save unsaved changes'))

      await expectSaved(alerts, {
        TinyNets: ['192.168.2.0/24', '192.168.8.0/24'],
        LeaseTime: '24h0m0s'
      })
    })

    it('saves a subnet when submitting its field', async () => {
      const { alerts } = await renderPage()

      const input = screen.getByDisplayValue('192.168.4.0/24')
      fireEvent.changeText(input, '192.168.6.0/24')
      fireEvent(input, 'submitEditing', {
        nativeEvent: { text: '192.168.6.0/24' }
      })

      await expectSaved(alerts, {
        TinyNets: ['192.168.2.0/24', '192.168.6.0/24'],
        LeaseTime: '24h0m0s'
      })
    })

    it('adds a supernetwork', async () => {
      const { alerts } = await renderPage()

      press(screen.getByText('Add Supernetwork'))
      await waitFor(() => expect(screen.getByDisplayValue('')).toBeTruthy())
      fireEvent.changeText(screen.getByDisplayValue(''), '10.10.0.0/24')
      press(screen.getByText('Save unsaved changes'))

      await expectSaved(alerts, {
        TinyNets: ['192.168.2.0/24', '192.168.4.0/24', '10.10.0.0/24'],
        LeaseTime: '24h0m0s'
      })
      expect(screen.getByDisplayValue('10.10.0.0/24')).toBeTruthy()
    })

    it('deletes a subnet right away', async () => {
      const { alerts } = await renderPage()

      press(screen.getByLabelText('Delete 192.168.4.0/24'))

      await expectSaved(alerts, {
        TinyNets: ['192.168.2.0/24'],
        LeaseTime: '24h0m0s'
      })
      expect(screen.queryByDisplayValue('192.168.4.0/24')).toBeNull()
      expect(screen.getByDisplayValue('192.168.2.0/24')).toBeTruthy()
    })

    it('reports a rejected save and keeps the edit', async () => {
      const { alerts } = await renderPage()

      fireEvent.changeText(screen.getByDisplayValue('24h0m0s'), 'one day')
      press(screen.getByText('Save unsaved changes'))

      await waitFor(() => expect(alerts.error).toHaveBeenCalled())
      expect(alerts.success).not.toHaveBeenCalled()

      const [title, err] = alerts.error.mock.calls[0]
      expect(title).toBe('Failed to update supernetworks')
      expect(err.status).toBe(400)
      expect(await err.response.text()).toBe('Invalid lease time')

      expect(savedBodies).toEqual([
        {
          TinyNets: ['192.168.2.0/24', '192.168.4.0/24'],
          LeaseTime: 'one day'
        }
      ])
      expect(dhcpConfig).toEqual(initialConfig())
      expect(screen.getByDisplayValue('one day')).toBeTruthy()
      expect(screen.getByText('Save unsaved changes')).toBeTruthy()
    })
  })

  describe('DHCP Table tab', () => {
    it('lists connected clients and devices that are not connected', async () => {
      const { alerts } = await renderPage()

      press(screen.getByText('DHCP Table'))

      await waitFor(() =>
        expect(screen.getByText('Connected Clients')).toBeTruthy()
      )
      await waitFor(() => expect(screen.getByText('rpi4')).toBeTruthy())
      expect(screen.getByText('wlan1.4096')).toBeTruthy()
      expect(screen.getByText('wlan1.4097')).toBeTruthy()

      expect(screen.getByText('Devices not connected')).toBeTruthy()
      for (const name of ['spr-atlas', 'phone', 'tv', 'desktop', 'android']) {
        expect(screen.getByText(name)).toBeTruthy()
      }
      expect(screen.getAllByText('laptop')).toHaveLength(2)
      expect(alerts.error).not.toHaveBeenCalled()
    })
  })
})
