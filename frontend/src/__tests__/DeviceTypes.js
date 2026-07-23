import {
  filterDevicesForPane,
  isContainerDevice
} from 'views/Devices/deviceTypes'

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
})
