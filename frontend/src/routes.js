import AddDevice from "views/Devices/AddDevice.js";
import Arp from "views/Devices/Arp.js";
import Devices from "views/Devices/Devices.js";
import Dhcp from "views/Zones/Dhcp.js";
import Home from "views/Home.js";
import Login from "views/pages/Login.js";
import SignalStrength from "views/SignalStrength.js";
import Traffic from "views/Traffic.js";
import TrafficTimeSeries from "views/TrafficTimeSeries.js";
import WirelessConfiguration from "views/WirelessConfiguration"
import Zones from "views/Zones/Zones.js";
import DNS from "views/DNS/DNS.js";

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
    state: "wirelessCollapse",
    views: [
      {
        path: "/wireless",
        name: "Wireless",
        mini: "W",
        component: WirelessConfiguration,
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
    collapse: true,
    name: "Traffic",
    icon: "nc-icon nc-chart-bar-32",
    state: "trafficCollapse",
    views: [
      {
        path: "/traffic",
        name: "Bandwidth Summary",
        mini: "SU",
        component: Traffic,
        layout: "/admin",
      },
      {
        path: "/timeseries",
        name: "Bandwidth Timeseries",
        mini: "TS",
        component: TrafficTimeSeries,
        layout: "/admin",
      },
      {
        path: "/signal/strength",
        name: "Signal Strength",
        mini: "SS",
        component: SignalStrength,
        layout: "/admin",
      }
    ]
  },
  {
    collapse: true,
    name: "DNS",
    icon: "nc-icon nc-world-2",
    state: "dnsCollapse",
    views: [
      {
        path: "/dns/block",
        name: "DNS blocklists",
        mini: "DB",
        component: DNS,
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
