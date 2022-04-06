import { testLogin as testLoginOld } from '../components/Helpers/Api'
import { saveLogin as saveLoginOld } from '../components/Helpers/Api'
import { getDevices, deleteDevice } from '../components/Helpers/Api'

import { api, testLogin, saveLogin } from 'api'

describe('API Login', () => {
  test('fail login', () => {
    testLogin('admin', 'adminzz', (success) => {
      expect(success).not.toBeTruthy()
    })
  })

  test('login', () => {
    testLogin('admin', 'admin', (success) => {
      expect(success).toBeTruthy()
      saveLogin('admin', 'admin')
    })
  })
})

describe('API Device', () => {
  saveLogin('admin', 'admin')

  test('fetches devices', async () => {
    let devices = await getDevices()
    expect(devices.length).toBeGreaterThan(1)

    let dev = devices[0]
    expect(dev.MAC).toEqual(
      expect.stringMatching(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    )
  })

  test('deletes a device', async () => {
    let devices = await getDevices()
    let len1 = devices.length
    let dev = devices[0]

    await deleteDevice(dev.MAC)

    devices = await getDevices()
    let len2 = devices.length
    expect(len2).toBe(len1 - 1)
  })
})
