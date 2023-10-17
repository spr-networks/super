import React from 'react'
/*
//import { NativeBaseProvider } from 'native-base'
//import { theme } from 'Theme'
//<NativeBaseProvider theme={theme}></NativeBaseProvider>
*/
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate
} from 'react-router-dom'
// TODO react-router-native for native
/*export {
  NativeRouter as Router,
  Switch,
  Route,
  Link
} from 'react-router-native'*/
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
