import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate
} from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'

import AuthLayout from 'layouts/Auth'
import AdminLayout from 'layouts/Admin'
import { routesAuth, routesAdmin } from 'routes'

import { GluestackUIProvider } from '@gluestack-ui/themed'
import { Theme } from '@gluestack-style/react'
import { config } from 'gluestack-ui.config'
import {
  themes,
  DEFAULT_THEME,
  buildCustomTheme,
  customThemeCss,
  mergeCustomThemes
} from 'Themes'

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

  const runtimeConfig = React.useMemo(
    () => mergeCustomThemes(config, customThemeRecords),
    [customThemeRecords]
  )

  return (
    <GluestackUIProvider config={runtimeConfig} colorMode={effectiveColorMode}>
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
  )
}
