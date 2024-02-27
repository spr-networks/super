import React, { useEffect } from 'react'
import {
  NativeRouter as Router,
  Route,
  Routes,
  Navigate
} from 'react-router-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import PushNotificationIOS from '@react-native-community/push-notification-ios'

import AuthLayout from 'layouts/Auth'
import AdminLayout from 'layouts/Admin'
import { routesAuth, routesAdmin } from 'routes'

import { GluestackUIProvider } from '@gluestack-ui/themed'
import { config } from 'gluestack-ui.config'
import { Base64 } from 'utils'

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

    //Notifications TODO move all this code to a js, register callbacks for confirm in future
    PushNotificationIOS.addEventListener('register', (token) => {
      console.log('** nTOKEN=', token)
      AsyncStorage.setItem('deviceToken', token)
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
