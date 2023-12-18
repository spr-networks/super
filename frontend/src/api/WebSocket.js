import { getApiHostname, getWsURL } from './API'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { deviceAPI } from './Device'
import { eventTemplate } from 'utils'

async function connectWebsocket(messageCallback) {
  let login = await AsyncStorage.getItem('user')
  let userData = JSON.parse(login),
    ws = null

  try {
    ws = new WebSocket(getWsURL())
  } catch (err) {
    // mock error
    console.error('[webSocket]', 'failed to connect to', getWsURL())
    return
  }

  ws.addEventListener('open', (event) => {

    AsyncStorage.getItem('jwt-otp').then((string) => {
      let jwt = JSON.parse(string)
      if (jwt) {
        ws.send(userData['username'] + ':' + userData['password'] + ':' + jwt.jwt)
      } else {
        ws.send(userData['username'] + ':' + userData['password'])
      }
    })

  })

  ws.addEventListener('message', (event) => {
    messageCallback(event)
  })

  return ws
}


const parseLogMessage = async (msg) => {
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

  //skip
  if (msgType.match(/^(dhcp|www):/)) {
    return null
  }

  const valid_types = ['info', 'warning', 'success', 'error', 'danger']
  if (msgType.startsWith('alert:')) {
    type = 'info'
    if (valid_types.includes(data.NotificationType)) {
      type = data.NotificationType
    }
    title = eventTemplate(data.Title, data.Event)
    body = eventTemplate(data.Body, data.Event)
    data = ''
  } else if (msgType.startsWith('wifi:auth')) {
    if (msgType.includes('success')) {
      let name = data.MAC

      try {
        let devices = await deviceAPI.list()
        let device = devices[data.MAC] || null

        name = device.Name || data.MAC
      } catch (err) {}

      type = 'success'
      body = `Authentication success for ${name}`
    } else {
      let wpaTypes = { sae: 'WPA3', wpa: 'WPA2' },
        wpaType = wpaTypes[data.Type] || data.Type,
        reasonString = 'unknown'

      if (data.Reason == 'noentry') {
        reasonString = `Unknown device with ${wpaType}`
      } else if (data.Reason == 'mismatch') {
        reasonString = `Wrong password with ${wpaType}`
      }

      body = `Authentication failure for MAC ${data.MAC}: ${reasonString}`
    }
  } else if (msgType.startsWith('nft')) {
    // data.Action ==  allowed || blocked
    type = 'confirm'

    if (data.Action == 'blocked') {
      type = 'warning'
    }

    title = `Netfilter ${data['Prefix']} ${data.Action}`
    let protocol = data.TCP !== undefined ? 'TCP' : 'UDP'
    body = `${data.IP.SrcIP} => ${data.IP.DstIP}:${data[protocol].DstPort}`
  }

  return {
    type,
    title,
    body,
    data
  }
}

export { connectWebsocket, parseLogMessage }
