import {
  deviceValues,
  filterDevicesForPane,
  findContainerAccessRule,
  findDeviceByIdentity,
  isContainerDevice,
  normalizeDeviceForUI
} from 'views/Devices/deviceTypes'
import { APIDevice } from 'api/Device'

describe('device pane filtering', () => {
  const devices = [
    { Name: 'phone', Type: '' },
    { Name: 'atlas', Type: 'Container' },
    { Name: 'legacy-device' }
  ]

  it('recognizes managed containers case-insensitively', () => {
    expect(isContainerDevice({ Type: 'container' })).toBe(true)
    expect(isContainerDevice({ Type: 'Container' })).toBe(true)
    expect(isContainerDevice({ Type: 'device' })).toBe(false)
  })

  it('keeps containers out of the Devices pane', () => {
    expect(
      filterDevicesForPane(devices, false).map((device) => device.Name)
    ).toEqual(['phone', 'legacy-device'])
  })

  it('shows only containers in the Containers pane', () => {
    expect(
      filterDevicesForPane(devices, true).map((device) => device.Name)
    ).toEqual(['atlas'])
  })

  it('finds a container by its MAC when the map key differs', () => {
    const container = {
      Name: 'atlas',
      Type: 'Container',
      MAC: '02:53:50:52:4b:13'
    }
    const response = { 'plugin-atlas': container }

    expect(
      findDeviceByIdentity(response, '02:53:50:52:4B:13')
    ).toBe(container)
    expect(deviceValues(response)).toEqual([container])
  })

  it('fills optional container fields required by the editor', () => {
    expect(
      normalizeDeviceForUI({
        Name: 'atlas',
        Type: 'Container',
        MAC: '02:53:50:52:4b:13'
      })
    ).toMatchObject({
      PSKEntry: { Psk: '', Type: '' },
      Policies: [],
      Groups: [],
      DeviceTags: [],
      Style: {}
    })
  })

  it('finds the plugin access rule linked to a container', () => {
    const rule = {
      RuleName: 'Plugin-spr-atlas',
      Interface: 'spr-atlas',
      SrcIP: '192.168.2.110'
    }

    expect(
      findContainerAccessRule([rule], {
        Name: 'spr-atlas',
        Type: 'Container',
        RecentIP: '192.168.2.110'
      })
    ).toBe(rule)
  })

  it('falls back to the container interface and IP for renamed rules', () => {
    const rule = {
      RuleName: 'renamed-rule',
      Interface: 'spr-atlas',
      SrcIP: '192.168.2.110/32'
    }

    expect(
      findContainerAccessRule([rule], {
        Name: 'spr-atlas',
        Type: 'Container',
        DHCPLastInterface: 'spr-atlas',
        RecentIP: '192.168.2.110'
      })
    ).toBe(rule)
  })

  it('does not link custom interface rules to ordinary devices', () => {
    expect(
      findContainerAccessRule(
        [{ RuleName: 'Plugin-phone', SrcIP: '192.168.2.101' }],
        {
          Name: 'phone',
          Type: 'Device',
          RecentIP: '192.168.2.101'
        }
      )
    ).toBeNull()
  })

  it('URL-encodes identities in the detail API request', () => {
    const client = new APIDevice()
    client.get = jest.fn()

    client.getDevice('02:53:50:52:4b:13')

    expect(client.get).toHaveBeenCalledWith(
      '/device?identity=02%3A53%3A50%3A52%3A4b%3A13'
    )
  })
})
