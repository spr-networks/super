/*!

=========================================================
* Paper Dashboard PRO React - v1.3.0
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2021 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";

import AuthLayout from "layouts/Auth.js";
import AdminLayout from "layouts/Admin.js";

import "bootstrap/dist/css/bootstrap.css";
import "assets/scss/paper-dashboard.scss?v=1.3.0";
import "perfect-scrollbar/css/perfect-scrollbar.css";

export default function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/auth" render={(props) => <AuthLayout {...props} />} />
        <Route path="/admin" render={(props) => <AdminLayout {...props} />} />
        <Redirect to="/auth/login" />
      </Switch>
    </BrowserRouter>
  );
}
