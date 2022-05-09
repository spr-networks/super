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

import './App.css'

export default function App() {
  return (
    <NativeBaseProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthLayout />}>
            {routesAuth.map((r) => (
              <Route path={r.path} element={<r.element />} />
            ))}
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            {routesAdmin.map((r) => (
              <Route key={r.path} path={r.path} element={<r.element />} />
            ))}
          </Route>

          <Route path="*" render={<Navigate to="/auth/login" />}></Route>
        </Routes>
      </Router>
    </NativeBaseProvider>
  )
}
