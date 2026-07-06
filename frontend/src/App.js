import React, { useContext, useEffect } from 'react'
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

import DeviceInfo from 'DeviceInfo'

import AuthLayout from 'layouts/Auth'
import AdminLayout from 'layouts/Admin'

import { parseLogMessage } from 'api/WebSocket'

import { routesAuth, routesAdmin } from 'routes'

import { GluestackUIProvider } from '@gluestack-ui/themed'
import { Theme } from '@gluestack-style/react'
import { config } from 'gluestack-ui.config'
import { themes, DEFAULT_THEME, buildCustomTheme, customThemeCss } from 'Themes'

export default function App() {
  const [colorMode, setColorMode] = React.useState('light')
  const [theme, setTheme] = React.useState(DEFAULT_THEME)
  const [customThemes, setCustomThemes] = React.useState({})

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
        if (viewSettings?.customThemes) {
          setCustomThemes(viewSettings.customThemes)
        }
        if (
          viewSettings?.theme &&
          (themes[viewSettings.theme] ||
            (viewSettings.customThemes || {})[viewSettings.theme])
        ) {
          setTheme(viewSettings.theme)
        }
      })
      .catch((err) => {
        console.error('ERR:', err)
      })
  }

  useEffect(() => {
    loadSettings()

    //iOS specific, setup notifications
    DeviceInfo.initDevice()

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
        let deviceInfo = await DeviceInfo.getDeviceInfo()

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

            //NOTE decrypted alert data is the same format as websocket notifications
            //default is .title and .body , websocket data is .Title, .Body, other
            if (alert?.Body) {
              //console.log('++ ok alert:', alert)
              //try parse with context here
              let devices = []
              try {
                let res = await AsyncStorage.getItem('devices')
                let d = JSON.parse(res)
                if (d) {
                  devices = d
                }

                const context = {
                  getDevice: (value, type = 'MAC') => {
                    if (!value) return null
                    return devices.find((d) => d[type] == value)
                  }
                }

                const parsed = await parseLogMessage(context, {
                  Type: 'alert:',
                  NotificationType: 'info',
                  Data: JSON.stringify(alert)
                })
                if (parsed) {
                  let { type, title, body, data } = parsed
                  //TODO type == confirm
                  if (title && body) {
                    req.title = title
                    req.body = body
                  }
                }
              } catch (e) {
                console.error('parse fail:', e)
              }
            } else {
              //console.log('-- weird/old alert msg:', alert)
              //NOTE wifi:auth or plugin: stuff, ignore
              //req.title = alert?.title || 'Alert'
              //req.body = alert?.body || alert?.Body || JSON.stringify(alert)
            }
          } catch (err) {
            //console.error('Failed to decrypt notification:', err)
            req.title = 'Alert error'
            req.body = '' + err
            //console.error('ENCRYPTED_DATA=', data.ENCRYPTED_DATA)
          }
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

  const customThemeRecords = React.useMemo(() => {
    let map = {}
    for (let [id, t] of Object.entries(customThemes)) {
      map[id] = { id, ...buildCustomTheme(t.spec, t.name) }
    }
    return map
  }, [customThemes])

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('spr-custom-theme')
    if (!el) {
      el = document.createElement('style')
      el.id = 'spr-custom-theme'
      document.head.appendChild(el)
    }
    el.textContent = Object.entries(customThemeRecords)
      .map(([id, t]) => customThemeCss(t, id))
      .join('\n')
  }, [customThemeRecords])

  const activeCustom = customThemeRecords[theme]
  const effectiveColorMode = activeCustom
    ? activeCustom.colorMode
    : themes[theme]?.colorMode || colorMode

  return (
    <>
      <GluestackUIProvider config={config} colorMode={effectiveColorMode}>
        <Theme name={theme} style={{ flex: 1 }}>
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
                element={
                  <AdminLayout
                    toggleColorMode={toggleColorMode}
                    setColorMode={setColorMode}
                    theme={theme}
                    setTheme={setTheme}
                    customThemes={customThemeRecords}
                    setCustomThemes={setCustomThemes}
                  />
                }
              >
                {routesAdmin.map((r) => (
                  <Route key={r.path} path={r.path} element={<r.element />} />
                ))}
              </Route>
            </Routes>
          </Router>
        </Theme>
      </GluestackUIProvider>
    </>
  )
}
