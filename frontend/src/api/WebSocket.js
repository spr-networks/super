import { getApiHostname, getWsURL } from './API'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { deviceAPI } from './Device'
import { eventTemplate } from 'components/Alerts/AlertUtil'

import { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { alertState, AppContext } from 'AppContext'

async function connectWebsocket(context, messageCallback) {
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
        ws.send(
          userData['username'] + ':' + userData['password'] + ':' + jwt.jwt
        )
      } else {
        ws.send(userData['username'] + ':' + userData['password'])
      }
    })
  })

  ws.addEventListener('message', (event) => {
    messageCallback(context, event)
  })

  return ws
}

const parseLogMessage = async (context, msg) => {
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
    title = eventTemplate(context, data.Title, data.Event)
    body = eventTemplate(context, data.Body, data.Event)
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

const WebSocketComponent = ({ confirm, notify, ...props }) => {
  const context = useContext(AppContext)
  const navigate = useNavigate()

  const handleWebSocketEvent = async (context, event) => {
    if (event.data == 'success') {
      return
    } else if (event.data == 'Authentication failure') {
      return alertState.error('Websocket failed to authenticate')
    } else if (event.data == 'Invalid JWT OTP') {
      //user needed an OTP validation
      navigate('/auth/validate')
      return
    }

    let eventData = JSON.parse(event.data)

    // if false it means event is streamed for logs or cli
    // this is set temporarily when viewing the sprbus via ws
    if (!eventData.Notification) {
      return
    }

    const res = await parseLogMessage(context, eventData)
    if (res) {
      //console.log('[NOTIFICATION]', JSON.stringify(res))
      let { type, title, body, data } = res

      if (title == 'StatusCalled') {
        //ignore debug message
        return
      }

      //console.log('plus disabled:', isPlusDisabled)

      // confirm notifications use pfw
      if (context.isPlusDisabled && type == 'confirm') {
        type = 'info'
      }

      if (type == 'confirm') {
        confirm(title, body, data)
      } else {
        notify(type, title, body)
      }
    }
  }

  useEffect(() => {
    let ws = connectWebsocket(context, handleWebSocketEvent)

    return () => {
      ws.close()
    }
  }, [])

  return <></>
}

export { WebSocketComponent, parseLogMessage }
