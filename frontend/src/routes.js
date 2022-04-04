import AddDevice from 'views/Devices/AddDevice.js'
import Arp from 'views/Devices/Arp.js'
import Devices from 'views/Devices/Devices.js'
import Dhcp from 'views/Zones/Dhcp.js'
import Home from 'views/Home.js'
import Login from 'views/pages/Login.js'
import SignalStrength from 'views/SignalStrength.js'
import Traffic from 'views/Traffic.js'
import TrafficTimeSeries from 'views/TrafficTimeSeries.js'
import WirelessConfiguration from 'views/WirelessConfiguration'
import Zones from 'views/Zones/Zones'
import DNSBlock from 'views/DNS/DNSBlock'
import DNSLog from 'views/DNS/DNSLog'
import DNSLogEdit from 'views/DNS/DNSLogEdit'

const routes = [
  {
    path: '/home',
    name: 'Home',
    icon: 'nc-icon nc-planet',
    component: Home,
    layout: '/admin'
  },
  {
    collapse: true,
    name: 'Devices',
    icon: 'nc-icon nc-laptop',
    state: 'devicesCollapse',
    views: [
      {
        path: '/devices',
        name: 'List',
        icon: 'fa fa-laptop',
        component: Devices,
        layout: '/admin'
      },
      {
        path: '/add_device',
        name: 'Add WiFi Device',
        icon: 'fa fa-plus-square',
        component: AddDevice,
        layout: '/admin'
      }
    ]
  },
  {
    collapse: true,
    name: 'Wireless Settings',
    icon: 'nc-icon nc-settings',
    state: 'wirelessCollapse',
    views: [
      {
        path: '/wireless',
        name: 'Wireless',
        icon: 'fa fa-wifi',
        component: WirelessConfiguration,
        layout: '/admin'
      }
    ]
  },
  {
    collapse: true,
    name: 'System',
    icon: 'nc-icon nc-bullet-list-67',
    state: 'systemCollapse',
    views: [
      {
        path: '/dhcp',
        name: 'DHCP Table',
        mini: 'DHCP',
        component: Dhcp,
        layout: '/admin'
      },
      {
        path: '/arp',
        name: 'ARP Table',
        mini: 'ARP',
        component: Arp,
        layout: '/admin'
      },
      {
        path: '/zones',
        name: 'Show Zones',
        icon: 'fa fa-tags',
        component: Zones,
        layout: '/admin'
      }
    ]
  },
  {
    collapse: true,
    name: 'Traffic',
    icon: 'nc-icon nc-chart-bar-32',
    state: 'trafficCollapse',
    views: [
      {
        path: '/traffic',
        name: 'Bandwidth Summary',
        mini: 'SU',
        component: Traffic,
        layout: '/admin'
      },
      {
        path: '/timeseries',
        name: 'Bandwidth Timeseries',
        mini: 'TS',
        component: TrafficTimeSeries,
        layout: '/admin'
      },
      {
        path: '/signal/strength',
        name: 'Signal Strength',
        mini: 'SS',
        component: SignalStrength,
        layout: '/admin'
      }
    ]
  },
  {
    collapse: true,
    name: 'DNS',
    icon: 'nc-icon nc-world-2',
    state: 'dnsCollapse',
    views: [
      {
        path: '/dnsBlock',
        name: 'Blocklists/Ad-Block',
        icon: 'fa fa-ban',
        component: DNSBlock,
        layout: '/admin'
      },
      {
        path: '/dnsLog/:ips/:text?',
        name: 'DNS Log',
        icon: 'fa fa-th-list',
        component: DNSLog,
        layout: '/admin'
      },
      {
        path: '/dnsLogEdit',
        name: 'DNS Log Settings',
        icon: 'fa fa-cogs',
        component: DNSLogEdit,
        layout: '/admin'
      }
    ]
  },

  {
    path: '/login',
    component: Login,
    layout: '/auth'
  }
]

export default routes
