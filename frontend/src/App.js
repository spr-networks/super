import React from 'react'
import { NativeBaseProvider } from 'native-base'

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
import { theme } from 'Theme'

//import './App.css'

export default function App() {
  return (
    <NativeBaseProvider theme={theme}>
      <Router>
        <Routes>
          <Route key="index" path="/" element={<Navigate to="/auth/login" />} />

          <Route key="auth" path="/auth" element={<AuthLayout />}>
            {routesAuth.map((r) => (
              <Route path={r.path} element={<r.element />} />
            ))}
          </Route>

          <Route key="admin" path="/admin" element={<AdminLayout />}>
            {routesAdmin.map((r) => (
              <Route key={r.path} path={r.path} element={<r.element />} />
            ))}
          </Route>
        </Routes>
      </Router>
    </NativeBaseProvider>
  )
}
