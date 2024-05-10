import React from 'react'
import { parseLogMessage } from 'api/WebSocket'

let devices = [{ MAC: '11:22:33:44:55:66', Name: 'Device#11' }]

const mockContext = {
  getDevice: (value, type = 'MAC') => {
    if (!value) return null
    return devices.find((d) => d[type] == value)
  }
}

describe('Parse Message', () => {
  test('alert:wifi:auth:success', async () => {
    let Data = {
      Title: 'Wifi Station Connected',
      Body: 'Authentication success for {{MAC#Device}}',
      Event: {
        Event: 'AP-STA-CONNECTED',
        Iface: 'wlan1.4108',
        MAC: '11:22:33:44:55:66',
        Router: '',
        Status: ''
      },
      NotificationType: 'info',
      RuleId: 'cb738c6f-aa20-4673-9012-1fc1646b83af',
      State: '',
      Topic: 'wifi:auth:success'
    }
    let msg = { Data, Notification: true, Type: 'alert:' }
    const parsed = await parseLogMessage(mockContext, msg)
    expect(parsed != null)
    expect(parsed.body).toMatch(/^Authentication success for Device#11$/)
  })

  test('auth:failure', async () => {
    let Data = {
      Title: 'Login Failure',
      Body: '{{name}} failed to login with {{reason}}',
      Event: {
        name: 'admin',
        reason: 'bad password',
        type: 'user'
      },
      NotificationType: 'error',
      RuleId: 'cb738c6f-aa20-4673-9012-1fc1646b83ad',
      State: '',
      Topic: 'auth:failure'
    }

    let msg = { Data, Notification: true, Type: 'alert:' }
    const parsed = await parseLogMessage(mockContext, msg)
    expect(parsed.body).toMatch(/admin/)
  })
})
