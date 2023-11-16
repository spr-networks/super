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
  }, [])

  return (
    <GluestackUIProvider config={config} colorMode={colorMode}>
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
            element={<AdminLayout toggleColorMode={toggleColorMode} />}
          >
            {routesAdmin.map((r) => (
              <Route key={r.path} path={r.path} element={<r.element />} />
            ))}
          </Route>
        </Routes>
      </Router>
    </GluestackUIProvider>
  )
}
