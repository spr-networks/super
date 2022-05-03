import React from 'react'
import { BrowserRouter, Route, Switch, Redirect } from 'react-router-dom'

import AuthLayout from 'layouts/Auth.js'
import AdminLayout from 'layouts/Admin.js'

import 'bootstrap/dist/css/bootstrap.css'
import './assets/scss/paper-dashboard.scss'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/auth" render={(props) => <AuthLayout {...props} />} />
        <Route path="/admin" render={(props) => <AdminLayout {...props} />} />
        <Redirect to="/auth/login" />
      </Switch>
    </BrowserRouter>
  )
}
