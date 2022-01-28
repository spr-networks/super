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
import Arp from "views/Devices/Arp.js";
import Devices from "views/Devices/Devices.js";
import Dhcp from "views/Zones/Dhcp.js";
import Home from "views/Home.js";
import Login from "views/pages/Login.js";
import Zones from "views/Zones/Zones.js";

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
      }
    ]
  },
  {
    collapse: true,
    name: "Wireless Settings",
    icon: "nc-icon nc-settings",
    state: "systemCollapse",
    views: [
      {
        path: "/wireless",
        name: "Wireless",
        mini: "W",
        component: Dhcp,
        layout: "/admin",
      }
    ]
  },
  {
    collapse: true,
    name: "System",
    icon: "nc-icon nc-bullet-list-67",
    state: "systemCollapse",
    views: [
      {
        path: "/dhcp",
        name: "DHCP Table",
        mini: "D",
        component: Dhcp,
        layout: "/admin",
      },
      {
        path: "/arp",
        name: "ARP Table",
        mini: "A",
        component: Arp,
        layout: "/admin",
      },
      {
        path: "/zones",
        name: "Show Zones",
        mini: "Z",
        component: Zones,
        layout: "/admin",
      }
    ]
  },
  {
    path: "/login",
    component: Login,
    layout: "/auth",
  },

];

export default routes;
