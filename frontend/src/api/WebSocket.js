import { getApiHostname } from './API'
import AsyncStorage from '@react-native-async-storage/async-storage'

async function connectWebsocket(messageCallback) {
  let login = await AsyncStorage.getItem('user')
  let userData = JSON.parse(login),
    ws = null

  try {
    let host = getApiHostname()
    ws = new WebSocket(`ws://${host}/ws`)
  } catch (err) {
    // mock error
    console.error('[webSocket]', 'failed to connect to', getApiHostname())
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

const parseLogMessage = (msg) => {
  const msgType = msg.Type
  let data = null
  try {
    if (msg.Data) {
      data = JSON.parse(msg.Data)
    }
  } catch (e) {
    // data is a raw string
    data = msg.Data
  }

  let title = msgType,
    type = 'info',
    body = typeof data === 'string' ? data : JSON.stringify(data)

  const skipTypes = ['DHCPUpdateProcessed', 'DHCPUpdateRequest']
  if (skipTypes.includes(msgType)) {
    return null
  }

  if (msgType == 'PSKAuthSuccess') {
    type = 'success'
    body = `Authentication success for MAC ${data.MAC}`
  } else if (msgType == 'PSKAuthFailure') {
    let wpaTypes = { sae: 'WPA3', wpa: 'WPA2' },
      wpaType = wpaTypes[data.Type] || data.Type,
      reasonString = 'unknown'

    if (data.Reason == 'noentry') {
      reasonString = `Unknown device with ${wpaType}`
    } else if (data.Reason == 'mismatch') {
      reasonString = `Wrong password with ${wpaType}`
    }

    body = `Authentication failure for MAC ${data.MAC}: ${reasonString}`
  } else if (msgType == 'StatusCalled') {
    body = `Status called with result: ${data}`
  } else if (msgType == 'nft') {
    body = `Action: ${data.action}, Src: ${data.src_ip}, Dest: ${data.dest_ip}, Prefix: ${data['oob.prefix']}`
  }

  return {
    type,
    title,
    body
  }
}

export { connectWebsocket, parseLogMessage }
