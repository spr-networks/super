import AsyncStorage from '@react-native-async-storage/async-storage'
import PushNotificationIOS from '@react-native-community/push-notification-ios'
import { getUniqueId } from 'react-native-device-info'
import { RSA } from 'react-native-rsa-native'

import { api } from 'api'

/*
first get saved settings
populate token if unset or updated
set deviceId
set keys if unset

result is stored & put to api on login
*/
const initDevice = () => {
  AsyncStorage.getItem('deviceInfo').then((res) => {
    let info = res ? JSON.parse(res) : {}
    console.log('** pre=', Object.keys(info))

    PushNotificationIOS.addEventListener('register', async (DeviceToken) => {
      console.log('** DeviceToken=', DeviceToken)
      info = { ...info, DeviceToken }

      try {
        info.DeviceId = await getUniqueId()

        // Generating keypair takes ~0.9s on iPhoneSE
        if (!info.PrivateKey) {
          let t = Date.now()
          let keys = await RSA.generateKeys(4096)
          console.log('** KeyTime=', (Date.now() - t) / 1e3, 's')
          let PrivateKey = keys.private,
            PublicKey = keys.public

          info = { ...info, PrivateKey, PublicKey }
        }

        AsyncStorage.setItem('deviceInfo', JSON.stringify(info))
      } catch (e) {
        console.error(e)
      }
    })
  })
}

const getDeviceInfo = async () => {
  let res = await AsyncStorage.getItem('deviceInfo')
  return res ? JSON.parse(res) : {}
}

// sync asyncStore info to api
const saveDeviceInfo = () => {
  AsyncStorage.getItem('deviceInfo').then((info) => {
    let deviceInfo = info ? JSON.parse(info) : null
    if (!deviceInfo) {
      //console.error('missing device info')
      return
    }

    let data = {
      DeviceId: deviceInfo.DeviceId,
      DeviceToken: deviceInfo.DeviceToken,
      PublicKey: deviceInfo.PublicKey
    }

    api
      .put('/alerts_register_ios', data)
      .then((res) => {
        console.log('num alert devices registered=', res.length)
      })
      .catch(async (err) => {
        let errorMessage = await err.response.text()
        console.error('Error saving device info:', errorMessage, err)
      })
  })
}

const DeviceInfo = { initDevice, getDeviceInfo, saveDeviceInfo }

export default DeviceInfo
