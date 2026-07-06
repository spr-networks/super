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
  CUSTOM_THEME_ID,
  buildCustomTheme,
  customThemeCss
} from 'Themes'

export default function App() {
  const [colorMode, setColorMode] = React.useState('light')
  const [theme, setTheme] = React.useState(DEFAULT_THEME)
  const [customSpec, setCustomSpec] = React.useState(null)
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
        if (viewSettings?.customTheme) {
          setCustomSpec(viewSettings.customTheme)
        }
        if (
          viewSettings?.theme &&
          (themes[viewSettings.theme] ||
            viewSettings.theme === CUSTOM_THEME_ID)
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

  const customTheme = React.useMemo(
    () => (customSpec ? buildCustomTheme(customSpec) : null),
    [customSpec]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('spr-custom-theme')
    if (!el) {
      el = document.createElement('style')
      el.id = 'spr-custom-theme'
      document.head.appendChild(el)
    }
    el.textContent = customThemeCss(customTheme)
  }, [customTheme])

  const effectiveColorMode =
    theme === CUSTOM_THEME_ID && customTheme
      ? customTheme.colorMode
      : themes[theme]?.colorMode || colorMode

  return (
    <GluestackUIProvider config={config} colorMode={effectiveColorMode}>
      <Theme name={theme} style={{ flex: 1 }}>
        <Router>
        <Routes>
          <Route key="index" path="/" element={<Navigate to="/auth/login" />} />

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
                theme={theme}
                setTheme={setTheme}
                customTheme={customTheme}
                setCustomTheme={setCustomSpec}
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
