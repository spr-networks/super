import AddDevice from 'views/Devices/AddDevice'
import ConnectDevice from 'views/Devices/ConnectDevice'
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
import AuthSettings from 'views/AuthSettings'
import {
  faBan,
  faBarChart,
  faCircleNodes,
  faCogs,
  faEthernet,
  faFireAlt,
  faHome,
  faLaptop,
  faLineChart,
  faListAlt,
  faNetworkWired,
  faPuzzlePiece,
  faSignal,
  faTags,
  faThList,
  faUnlockAlt,
  faUser,
  faWifi
} from '@fortawesome/free-solid-svg-icons'
/*TODO WireguardIcon: {
icon: (5) [576, 512, Array(3), 'f012', 'M544 0c-17.67 0-32 14.33-32 31.1V480C512 497.7 526…-14.33 32-31.1V223.1C320 206.3 305.7 192 288 192z']
iconName: "signal"
prefix: "fas"}*/

const routes = [
  {
    path: '/home',
    name: 'Home',
    icon: faHome,
    component: Home,
    layout: '/admin'
  },
  {
    name: 'Devices',
    icon: faLaptop,
    path: '/devices',
    component: Devices,
    layout: '/admin'
  },
  {
    layout: '/admin',
    path: '/add_device',
    redirect: true,
    component: AddDevice
  },
  {
    layout: '/admin',
    path: '/connect_device',
    redirect: true,
    component: ConnectDevice
  },
  {
    path: '/wireless',
    name: 'Wifi',
    icon: faWifi,
    component: WirelessConfiguration,
    layout: '/admin'
  },
  {
    path: '/wireguard',
    name: 'VPN',
    icon: faCircleNodes,
    component: Wireguard,
    layout: '/admin'
  },
  {
    path: '/firewall',
    name: 'Firewall',
    icon: faFireAlt,
    component: Firewall,
    layout: '/admin'
  },
  {
    collapse: true,
    name: 'Traffic',
    icon: faLineChart /*'nc-icon nc-chart-bar-32',*/,
    state: 'trafficCollapse',
    views: [
      {
        path: '/traffic',
        name: 'Bandwidth Summary',
        icon: faLineChart,
        component: Traffic,
        layout: '/admin'
      },
      {
        path: '/timeseries',
        name: 'Bandwidth Timeseries',
        icon: faBarChart,
        component: TrafficTimeSeries,
        layout: '/admin'
      },
      {
        path: '/signal/strength',
        name: 'Signal Strength',
        icon: faSignal,
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
        icon: faBan,
        component: DNSBlock,
        layout: '/admin'
      },
      {
        path: '/dnsLog/:ips/:text?',
        name: 'DNS Log',
        icon: faThList,
        component: DNSLog,
        layout: '/admin'
      },
      {
        path: '/dnsLogEdit',
        name: 'DNS Log Settings',
        icon: faCogs,
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
        icon: faNetworkWired,
        component: Dhcp,
        layout: '/admin'
      },
      {
        path: '/arp',
        name: 'ARP Table',
        icon: faEthernet,
        component: Arp,
        layout: '/admin'
      },
      {
        path: '/groups',
        name: 'Groups',
        icon: faTags,
        component: Groups,
        layout: '/admin'
      },
      {
        path: '/plugins',
        name: 'Plugins',
        icon: faPuzzlePiece,
        component: Plugins,
        layout: '/admin'
      },
      {
        path: '/logs/:containers',
        name: 'Logs',
        icon: faListAlt,
        component: Logs,
        layout: '/admin'
      },
      {
        path: '/auth/',
        name: 'Auth',
        icon: faUser,
        component: AuthSettings,
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
