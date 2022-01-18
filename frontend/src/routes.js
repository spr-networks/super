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
import AddDevice from "views/Devices/AddDevice.js";
import Devices from "views/Devices/Devices.js";
import Home from "views/Home.js";
import Login from "views/pages/Login.js";

const routes = [
  {
    path: "/home",
    name: "Home",
    icon: "nc-icon nc-planet",
    component: Home,
    layout: "/admin",
  },
  {
    collapse: true,
    name: "Devices",
    icon: "nc-icon nc-laptop",
    state: "devicesCollapse",
    views: [
      {
        path: "/devices",
        name: "List",
        mini: "L",
        component: Devices,
        layout: "/admin",
      },
      {
        path: "/add_device",
        name: "Add WiFi Device",
        mini: "AW",
        component: AddDevice,
        layout: "/admin",
      },
    ]
  },
  {
    path: "/login",
    component: Login,
    layout: "/auth",
  },

];

export default routes;
