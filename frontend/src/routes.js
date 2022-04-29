import AddDevice from 'views/Devices/AddDevice'
import Arp from 'views/Devices/Arp'
import Devices from 'views/Devices/Devices'
import Dhcp from 'views/Groups/Dhcp'
import Home from 'views/Home'
import Login from 'views/pages/Login'
import SignalStrength from 'views/SignalStrength'
import Traffic from 'views/Traffic'
import TrafficTimeSeries from 'views/TrafficTimeSeries'
import WirelessConfiguration from 'views/WirelessConfiguration'
import Groups from 'views/Groups/Groups'
import DNSBlock from 'views/DNS/DNSBlock'
import DNSLog from 'views/DNS/DNSLog'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import Wireguard from 'views/Wireguard'
import Firewall from 'views/Firewall'
import Logs from 'views/Logs'
import Plugins from 'views/Plugins'

const routes = [
  {
    path: '/home',
    name: 'Home',
    icon: 'nc-icon nc-planet',
    component: Home,
    layout: '/admin'
  },
  {
    name: 'Devices',
    icon: 'fa fa-laptop',
    path: '/devices',
    component: Devices,
    layout: '/admin'
  },
  {
    layout: '/admin',
    path: '/add_device',
    redirect: true,
    name: 'Add WiFi Device',
    icon: 'fa fa-plus-square',
    component: AddDevice
  },
  {
    path: '/wireless',
    name: 'Wifi',
    icon: 'fa fa-wifi',
    component: WirelessConfiguration,
    layout: '/admin'
  },
  {
    path: '/wireguard',
    name: 'VPN',
    icon: 'nc-icon nc-wireguard',
    component: Wireguard,
    layout: '/admin'
  },
  {
    path: '/firewall',
    name: 'Firewall',
    icon: 'fa fa-unlock-alt',
    component: Firewall,
    layout: '/admin'
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
        icon: 'fa fa-line-chart',
        component: Traffic,
        layout: '/admin'
      },
      {
        path: '/timeseries',
        name: 'Bandwidth Timeseries',
        icon: 'fa fa-bar-chart',
        component: TrafficTimeSeries,
        layout: '/admin'
      },
      {
        path: '/signal/strength',
        name: 'Signal Strength',
        icon: 'fa fa-signal',
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
        path: '/groups',
        name: 'Groups',
        icon: 'fa fa-tags',
        component: Groups,
        layout: '/admin'
      },
      {
        path: '/plugins',
        name: 'Plugins',
        icon: 'fa fa-puzzle-piece',
        component: Plugins,
        layout: '/admin'
      },
      {
        path: '/logs/:containers',
        name: 'Logs',
        icon: 'fa fa-list-alt',
        component: Logs,
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
