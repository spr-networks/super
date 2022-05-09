import React from 'react'
import { NativeBaseProvider } from 'native-base'

import {
  BrowserRouter as Router,
  Route,
  Switch,
  Redirect
} from 'react-router-dom'
// TODO react-router-native for native
/*export {
  NativeRouter as Router,
  Switch,
  Route,
  Link
} from 'react-router-native'*/
import AuthLayout from 'layouts/Auth.js'
import AdminLayout from 'layouts/Admin.js'

import './App.css'

export default function App() {
  return (
    <NativeBaseProvider>
      <Router>
        <Switch>
          <Route path="/auth" render={(props) => <AuthLayout {...props} />} />
          <Route path="/admin" render={(props) => <AdminLayout {...props} />} />
          <Redirect to="/auth/login" />
        </Switch>
      </Router>
    </NativeBaseProvider>
  )
}
