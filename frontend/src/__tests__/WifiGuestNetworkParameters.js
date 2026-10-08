import React from 'react'
import { fireEvent, render } from 'test-utils'
import WifiGuestNetworkParameters from 'components/Wifi/WifiGuestNetworkParameters'
import DeviceQRCode from 'components/Devices/DeviceQRCode'
import { CheckboxGroup } from '@gluestack-ui/themed'

jest.mock('components/Devices/DeviceQRCode', () => jest.fn(() => null))

const props = {
  iface: 'wlan0',
  config: { ssid: 'Main', hw_mode: 'g' },
  iws: [{
    devices: { wlan0: { addr: '02:00:00:00:00:01' } },
    valid_interface_combinations: ['#AP <= 2']
  }],
  curInterface: { Name: 'wlan0', ExtraBSS: [] },
  updateExtraBSS: jest.fn(),
  deleteExtraBSS: jest.fn()
}

test('allows entering a static guest password during first setup', () => {
  props.updateExtraBSS.mockClear()
  const view = render(<WifiGuestNetworkParameters {...props} />)
  fireEvent.press(view.getByText('Enable Guest SSID'))
  const password = view.getByLabelText('Guest Password')
  fireEvent.changeText(password, 'first-passphrase')
  expect(view.getByDisplayValue('first-passphrase')).toBeTruthy()
  fireEvent.press(view.getByText('Save'))
  expect(props.updateExtraBSS).toHaveBeenCalledWith(
    'wlan0',
    expect.objectContaining({
      Ssid: 'Main-guest',
      Bssid: '02:00:00:00:00:01',
      guestPassword: 'first-passphrase'
    })
  )
})

test('allows entering a revealed static guest password during first setup', () => {
  DeviceQRCode.mockClear()
  const view = render(<WifiGuestNetworkParameters {...props} />)
  fireEvent.press(view.getByText('Enable Guest SSID'))
  fireEvent.press(view.getAllByRole('button')[0])
  const password = view.getByLabelText('Guest Password')
  fireEvent.changeText(password, 'first-passphrase')
  expect(view.getByDisplayValue('first-passphrase')).toBeTruthy()
  expect(DeviceQRCode).not.toHaveBeenCalled()
})

test('shows the QR code for an already saved guest password', () => {
  DeviceQRCode.mockClear()
  const savedInterface = {
    Name: 'wlan0',
    ExtraBSS: [{
      Ssid: 'Main-guest',
      GuestPassword: 'saved-passphrase',
      Wpa: '2',
      WpaKeyMgmt: 'WPA-PSK'
    }]
  }
  const view = render(
    <WifiGuestNetworkParameters {...props} curInterface={savedInterface} />
  )
  fireEvent.press(view.getAllByRole('button')[0])
  expect(DeviceQRCode).toHaveBeenCalledWith(
    expect.objectContaining({ ssid: 'Main-guest', psk: 'saved-passphrase' }),
    {}
  )
})

test('keeps an unfinished password when interface data arrives', () => {
  const view = render(
    <WifiGuestNetworkParameters {...props} curInterface={undefined} />
  )
  fireEvent.press(view.getByText('Enable Guest SSID'))
  fireEvent.changeText(view.getByLabelText('Guest Password'), 'first-passphrase')

  view.rerender(<WifiGuestNetworkParameters {...props} />)

  expect(view.getByDisplayValue('first-passphrase')).toBeTruthy()
})

test('empty static password shows validation instead of submitting', () => {
  props.updateExtraBSS.mockClear()
  const view = render(<WifiGuestNetworkParameters {...props} />)
  fireEvent.press(view.getByText('Enable Guest SSID'))
  fireEvent.changeText(view.getByLabelText('Guest Password'), 'temporary-password')
  fireEvent.changeText(view.getByLabelText('Guest Password'), '')
  fireEvent.press(view.getByText('Save'))

  expect(view.getByText('Password too short')).toBeTruthy()
  expect(props.updateExtraBSS).not.toHaveBeenCalled()
})

test('ignores a non-selection event from the iOS password field', () => {
  const view = render(<WifiGuestNetworkParameters {...props} />)
  fireEvent.press(view.getByText('Enable Guest SSID'))
  const password = view.getByLabelText('Guest Password')
  for (let parent = password.parent; parent; parent = parent.parent) {
    expect(parent.type).not.toBe(CheckboxGroup)
  }
  fireEvent.changeText(password, 'temporary-password')

  fireEvent(view.UNSAFE_getByType(CheckboxGroup), 'change', undefined)
  fireEvent.changeText(password, '')

  expect(view.getByLabelText('Guest Password').props.value).toBe('')
  expect(view.getByText('Use Static Password')).toBeTruthy()
})

test('clearing a saved password handles a missing native text value', () => {
  props.updateExtraBSS.mockClear()
  const savedInterface = {
    Name: 'wlan0',
    ExtraBSS: [{
      Ssid: 'Main-guest',
      GuestPassword: 'saved-passphrase',
      Wpa: '2',
      WpaKeyMgmt: 'WPA-PSK'
    }]
  }
  const view = render(
    <WifiGuestNetworkParameters {...props} curInterface={savedInterface} />
  )
  fireEvent.press(view.getAllByRole('button')[0])
  fireEvent.changeText(view.getByLabelText('Guest Password'), null)

  expect(view.getByLabelText('Guest Password').props.value).toBe('')
  fireEvent.press(view.getByText('Save'))
  expect(view.getByText('Password too short')).toBeTruthy()
  expect(props.updateExtraBSS).not.toHaveBeenCalled()
})
