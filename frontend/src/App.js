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

  useEffect(() => {
    loadSettings()

    /*
    first get saved settings
    populate token if unset or updated
    set deviceId
    set keys if unset

    result is stored & put to api on login
    */
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

          console.log('** set=', Object.keys(info))

          AsyncStorage.setItem('deviceInfo', JSON.stringify(info))
        } catch (e) {
          console.error(e)
        }
      })
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

        const getDeviceInfo = async () => {
          let res = await AsyncStorage.getItem('deviceInfo')
          return res ? JSON.parse(res) : {}
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
