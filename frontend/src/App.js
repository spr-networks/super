import React, { useEffect } from 'react'
import {
  NativeRouter as Router,
  Route,
  Routes,
  Navigate
} from 'react-router-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import PushNotificationIOS from '@react-native-community/push-notification-ios'
import { getUniqueId } from 'react-native-device-info'
import { RSA } from 'react-native-rsa-native'

import AuthLayout from 'layouts/Auth'
import AdminLayout from 'layouts/Admin'
import { routesAuth, routesAdmin } from 'routes'

import { GluestackUIProvider } from '@gluestack-ui/themed'
import { config } from 'gluestack-ui.config'

export default function App() {
  const [colorMode, setColorMode] = React.useState('light')
  const [deviceInfo, setDeviceInfo] = React.useState({})
  const toggleColorMode = () => {
    setColorMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const loadSettings = () => {
    AsyncStorage.getItem('settings')
      .then((settings) => {
        let viewSettings = JSON.parse(settings)
        if (viewSettings?.colorMode && viewSettings.colorMode !== colorMode) {
          toggleColorMode()
        }
      })
      .catch((err) => {
        console.error('ERR:', err)
      })
  }

  const getDeviceInfo = async () => {
    let info = await AsyncStorage.getItem('deviceInfo')
    let deviceInfo = {}

    try {
      deviceInfo = JSON.parse(info) || {}
    } catch (e) {}

    return deviceInfo
  }

  const loadDeviceInfo = async () => {
    try {
      let info = await AsyncStorage.getItem('deviceInfo')
      let deviceInfo = {}
      // parse if stored
      let d = JSON.parse(info)
      if (d) {
        deviceInfo = d
      }

      let DeviceId = await getUniqueId()
      deviceInfo.DeviceId = DeviceId

      // Generating keypair takes ~0.9s on iPhoneSE
      if (!deviceInfo.PrivateKey) {
        let t = Date.now()
        let keys = await RSA.generateKeys(4096)
        console.log('KeyTime=', (Date.now() - t) / 1e3, 's')
        let PrivateKey = keys.private,
          PublicKey = keys.public

        deviceInfo = { ...deviceInfo, PrivateKey, PublicKey }
      }

      setDeviceInfo(deviceInfo)
      AsyncStorage.setItem('deviceInfo', JSON.stringify(deviceInfo))
    } catch (e) {
      console.error(e)
    }
  }

  // fetch other deviceInfo when we have the token
  useEffect(() => {
    if (!deviceInfo.DeviceToken || deviceInfo.DeviceId) {
      return
    }

    loadDeviceInfo()
  }, [deviceInfo])

  useEffect(() => {
    loadSettings()

    //Notifications TODO move all this code to a js, register callbacks for confirm in future
    //DeviceInfoSync or smtg
    PushNotificationIOS.addEventListener('register', (DeviceToken) => {
      /*if (DeviceToken.length > 64) {
        console.log('** got iosSim deviceToken')
        DeviceToken = '1'.repeat(64)
      }*/

      console.log('** DeviceToken=', DeviceToken)
      let deviceInfo = { ...deviceInfo, DeviceToken }
      AsyncStorage.setItem('deviceInfo', JSON.stringify(deviceInfo))
      setDeviceInfo(deviceInfo)
    })

    PushNotificationIOS.addEventListener(
      'notification',
      async (notification) => {
        const category = notification.getCategory()
        // data is if we pass any other data in the notification
        const data = notification.getData()

        console.log('** HANDLER, category=', category)
        let req = {
          id: new Date().toString(),
          title: '',
          body: '',
          badge: 0, // counter on home screen
          threadId: 'thread-id'
        }

        //NOTE need to fetch it when within the handler
        let deviceInfo = await getDeviceInfo()
        //console.log('deviceInfo=', deviceInfo)

        if (category == 'PLAIN') {
          req.title = notification.getTitle()
          req.body = notification.getMessage()
        } else if (category == 'SECRET' && data.ENCRYPTED_DATA) {
          try {
            if (!deviceInfo.PrivateKey) {
              throw `Missing key to decrypt data`
            }

            //data is in base64
            let jsonData = await RSA.decrypt(
              data.ENCRYPTED_DATA,
              deviceInfo.PrivateKey
            )

            if (!jsonData) {
              throw 'invalid data'
            }

            let alert = JSON.parse(jsonData)

            req.title = alert.title
            req.body = alert.body
          } catch (err) {
            console.error('Failed to decrypt notification:', err)
            //console.error('ENCRYPTED_DATA=', data.ENCRYPTED_DATA)
          }
        } else {
          req.title = 'Unknown notification'
          req.body = 'Unknown'
        }

        if (req.title?.length) {
          //TODO also able to set confirm-stuff for buttons and more data
          PushNotificationIOS.addNotificationRequest(req)
        }

        notification.finish('UIBackgroundFetchResultNoData')
      }
    )

    PushNotificationIOS.requestPermissions({
      alert: true,
      badge: true,
      sound: true,
      critical: true
    }).then(
      (data) => {},
      (data) => {}
    )

    return () => {
      PushNotificationIOS.removeEventListener('notification')
      PushNotificationIOS.removeEventListener('register')
    }
  }, [])

  return (
    <>
      <GluestackUIProvider config={config} colorMode={colorMode}>
        <Router>
          <Routes>
            <Route
              key="index"
              path="/"
              element={<Navigate to="/auth/login" />}
            />

            <Route
              key="auth"
              path="/auth"
              element={<AuthLayout toggleColorMode={toggleColorMode} />}
            >
              {routesAuth.map((r) => (
                <Route key={r.path} path={r.path} element={<r.element />} />
              ))}
            </Route>

            <Route
              key="admin"
              path="/admin"
              element={<AdminLayout toggleColorMode={toggleColorMode} />}
            >
              {routesAdmin.map((r) => (
                <Route key={r.path} path={r.path} element={<r.element />} />
              ))}
            </Route>
          </Routes>
        </Router>
      </GluestackUIProvider>
    </>
  )
}
