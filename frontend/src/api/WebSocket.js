import { apiURL } from './API'

function connectWebsocket(messageCallback) {
  let userData = JSON.parse(localStorage.getItem('user')),
    ws = null

  try {
    let host = new URL(apiURL()).host
    ws = new WebSocket(`ws://${host}/ws`)
  } catch (err) {
    // mock error
    return
  }

  ws.addEventListener('open', (event) => {
    ws.send(userData['username'] + ':' + userData['password'])
  })

  ws.addEventListener('message', (event) => {
    messageCallback(event)
  })

  return ws
}

const parseLogMessage = (data) => {
  const skipTypes = ['DHCPUpdateProcessed', 'DHCPUpdateRequest']
  if (skipTypes.includes(data.Type)) {
    return null
  }

  let _data = data.Data ? JSON.parse(data.Data) : {}

  if (data.Type == 'PSKAuthSuccess') {
    return {
      type: 'success',
      message: `Authentication success for MAC ${_data.MAC}`
    }
  } else if (data.Type == 'PSKAuthFailure') {
    let wpaTypes = { sae: 'WPA3', wpa: 'WPA2' },
      wpaType = wpaTypes[_data.Type] || _data.Type,
      reasonString = 'unknown'

    if (_data.Reason == 'noentry') {
      reasonString = `Unknown device with ${wpaType}`
    } else if (_data.Reason == 'mismatch') {
      reasonString = `Wrong password with ${wpaType}`
    }

    return {
      type: 'error',
      message: `Authentication failure for MAC ${_data.MAC}: ${reasonString}`
    }
  }

  return {
    type: 'info',
    message: JSON.stringify(_data)
  }
}

export { connectWebsocket, parseLogMessage }
