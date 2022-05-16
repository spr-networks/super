import API from 'api'
import { api, deviceAPI, testLogin, saveLogin } from 'api'

describe('API component', () => {
  let _REACT_APP_API = null
  // save the one that is already set
  beforeEach(() => (_REACT_APP_API = process.env.REACT_APP_API))

  test('default baseurl', () => {
    delete process.env.REACT_APP_API
    let _api = new API()
    expect(_api.baseURL).toBe('http://localhost/')
  })

  afterEach(() => (process.env.REACT_APP_API = _REACT_APP_API))
})

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

  test('save login', () => {
    saveLogin('admin', 'admin')

    let user = JSON.parse(localStorage.getItem('user'))
    expect(user.username).toBe('admin')
    expect(user.password).toBe('admin')
    expect(user.authdata).toBe('YWRtaW46YWRtaW4=')
  })
})

/*
describe('API Device', () => {
  saveLogin('admin', 'admin')

  test('fetches devices', async () => {
    let devices = await deviceAPI.list()
    expect(devices.length).toBeGreaterThan(1)

    let dev = devices[0]
    expect(dev.MAC).toEqual(
      expect.stringMatching(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    )
  })

  test('deletes a device', async () => {
    let devices = await deviceAPI.list()
    let len1 = devices.length
    let dev = devices[0]

    await deviceAPI.deleteDevice(dev.MAC)

    devices = await deviceAPI.list()
    let len2 = devices.length
    expect(len2).toBe(len1 - 1)
  })
})
*/
