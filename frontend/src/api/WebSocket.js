import { useContext, useEffect, useState, useRef } from 'react'

import { getApiHostname, getWsURL } from './API'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { deviceAPI } from './Device'
import { eventTemplate } from 'components/Alerts/AlertUtil'

import { useNavigate } from 'react-router-dom'
import { alertState, AppContext } from 'AppContext'

// NOTE this function checks if its a alert, if not return null
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

  //skip events, only parse if alert: prefix
  if (msgType.match(/^(dhcp|www|wifi):/)) {
    return null
  }

  const valid_types = ['info', 'warning', 'success', 'error', 'danger']
  if (msgType.startsWith('alert:')) {
    type = 'info'
    if (valid_types.includes(data.NotificationType)) {
      type = data.NotificationType
    }

    //NOTE have todo this since parseLogMessage is also used for push alerts
    let supportTags = false //Platform.OS == 'web'

    title = eventTemplate(context, data.Title, data.Event, false)
    body = eventTemplate(context, data.Body, data.Event, supportTags)
    data = ''
  } /* else if (msgType.startsWith('wifi:auth')) {
    if (msgType.includes('success')) {
      let name = context.getDevice(data.MAC)?.Name || data.MAC

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
  }*/ else if (msgType.startsWith('plugin:')) {
    type = 'warning'
    switch (msgType) {
      case 'plugin:download:success':
        type = 'success'
        body = `Successfully downloaded ${data.GitURL}`
        break
      case 'plugin:download:exists':
        type = 'info'
        body = `Found existing download for ${data.GitURL}`
        break
      case 'plugin:download:failure':
        body = `Failed to download ${data.GitURL}`
        break
      case 'plugin:install:failure':
        body = `Failed to install ${data.GitURL} ${msgType}`
        break
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
  //const context = useContext(AppContext)
  const navigate = useNavigate()
  const ws = useRef(null)

  const handleWebSocketEvent = async (event) => {
    if (event.data == 'success') {
      return
    } else if (event.data == 'Authentication failure') {
      return alertState.error('Websocket failed to authenticate')
    } else if (event.data == 'Invalid JWT OTP') {
      //user needed an OTP validation. TODO dont navigate here
      navigate('/auth/validate')
      return
    }

    let eventData = JSON.parse(event.data)

    // if false it means event is streamed for logs or cli
    if (!eventData.Notification) {
      return
    }

    //context does not work here
    let devices = []
    try {
      let res = await AsyncStorage.getItem('devices')
      let d = JSON.parse(res)
      if (d) {
        devices = d
      }
    } catch (err) {}

    const context = {
      getDevice: (value, type = 'MAC') => {
        if (!value) return null
        return devices.find((d) => d[type] == value)
      }
    }

    const res = await parseLogMessage(context, eventData)
    if (res) {
      //console.log('[NOTIFICATION]', JSON.stringify(res))
      let { type, title, body, data } = res

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
    try {
      ws.current = new WebSocket(getWsURL())
    } catch (err) {
      // mock error
      console.error('[webSocket]', 'failed to connect to', getWsURL())
      return
    }

    const wsCurrent = ws.current

    AsyncStorage.getItem('user').then((login) => {
      let userData = JSON.parse(login)

      wsCurrent.addEventListener('open', (event) => {
        AsyncStorage.getItem('jwt-otp').then((string) => {
          let jwt = JSON.parse(string)
          if (jwt) {
            wsCurrent.send(
              userData['username'] + ':' + userData['password'] + ':' + jwt.jwt
            )
          } else {
            wsCurrent.send(userData['username'] + ':' + userData['password'])
          }
        })
      })

      wsCurrent.addEventListener('message', handleWebSocketEvent)
    })

    return () => {
      wsCurrent?.close()
    }
  }, [])
}

export { WebSocketComponent, parseLogMessage }
