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
import { Base64 } from 'utils'

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

  const loadDeviceInfo = () => {
    AsyncStorage.getItem('device')
      .then(async (info) => {
        let deviceInfo = {}
        // parse if stored
        try {
          let d = JSON.parse(info)
          if (d) {
            deviceInfo = d
          }
        } catch (e) {}

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

        //TODO post this to /alerts_register

        setDeviceInfo(deviceInfo)
      })
      .catch((err) => {
        console.error('ERR:', err)
      })
  }

  useEffect(() => {
    console.log('save deviceInfo', JSON.stringify(deviceInfo))
    AsyncStorage.setItem('device', JSON.stringify(deviceInfo))
  }, [deviceInfo])

  useEffect(() => {
    loadSettings()
    loadDeviceInfo()

    //Notifications TODO move all this code to a js, register callbacks for confirm in future
    //DeviceInfoSync or smtg
    PushNotificationIOS.addEventListener('register', async (DeviceToken) => {
      console.log('** nTOKEN=', DeviceToken)
      setDeviceInfo({ ...deviceInfo, DeviceToken })
    })

    PushNotificationIOS.addEventListener('notification', (notification) => {
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

      if (category == 'PLAIN') {
        req.title = notification.getTitle()
        req.body = notification.getMessage()
      } else if (category == 'SECRET' && data.ENCRYPTED_DATA) {
        try {
          let d = Base64.atob(data.ENCRYPTED_DATA)
          let alert = JSON.parse(d)
          //TODO decrypt here
          req.title = alert.title
          req.body = alert.body
        } catch (err) {
          //TODO SKIP showing if bork
        }
      } else {
        req.title = 'Unknown notification'
        req.body = 'Unknown'
      }

      if (req.title?.length) {
        PushNotificationIOS.addNotificationRequest(req)
      }

      notification.finish('UIBackgroundFetchResultNoData')
    })

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
