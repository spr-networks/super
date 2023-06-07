import { Platform } from 'react-native'

import AddDevice from 'views/Devices/AddDevice'
import ConnectDevice from 'views/Devices/ConnectDevice'
import Arp from 'views/Devices/Arp'
import Devices from 'views/Devices/Devices'
import Dhcp from 'views/Groups/Dhcp'
import Home from 'views/Home'
import Login from 'views/pages/Login'
import Setup from 'views/pages/Setup'
import SignalStrength from 'views/Traffic/SignalStrength'
import Traffic from 'views/Traffic/Traffic'
import TrafficTimeSeries from 'views/Traffic/TrafficTimeSeries'
import TrafficList from 'views/Traffic/TrafficList'
import UplinkConfiguration from 'views/UplinkConfiguration'
import WirelessConfiguration from 'views/WirelessConfiguration'
import Groups from 'views/Groups/Groups'
import Tags from 'views/Tags'
import DNSBlock from 'views/DNS/DNSBlock'
import DNSLog from 'views/DNS/DNSLog'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import DynDns from 'views/DNS/DynDns'
import Wireguard from 'views/Wireguard'
import Firewall from 'views/Firewall'
import PFW from 'views/Pfw'
import Mesh from 'views/Mesh'
import Logs from 'views/Logs'
import Plugins from 'views/Plugins'
import AuthSettings from 'views/AuthSettings'
import SystemInfo from 'views/SystemInfo'
import Notifications from 'views/Notifications'
import SpeedTest from 'views/SpeedTest'
import Supernetworks from 'views/Supernetworks'

import {
  faArrowCircleUp,
  faBan,
  faBarChart,
  faBell,
  faChartColumn,
  faDiagramProject,
  faCircleNodes,
  faCogs,
  faEthernet,
  faFire,
  faFireAlt,
  faGauge,
  faGlobe,
  faHome,
  faLaptop,
  faLineChart,
  faListAlt,
  faNetworkWired,
  faObjectGroup,
  faPuzzlePiece,
  faSignal,
  faSitemap,
  faTags,
  faThList,
  faUnlockAlt,
  faUser,
  faWaveSquare,
  faWifi
} from '@fortawesome/free-solid-svg-icons'
/*TODO WireguardIcon: {
icon: (5) [576, 512, Array(3), 'f012', 'M544 0c-17.67 0-32 14.33-32 31.1V480C512 497.7 526…-14.33 32-31.1V223.1C320 206.3 305.7 192 288 192z']
iconName: "signal"
prefix: "fas"}*/

const routes = [
  {
    path: 'home',
    name: 'Home',
    icon: faHome,
    component: Home,
    layout: 'admin'
  },
  {
    name: 'Devices',
    icon: faLaptop,
    path: 'devices',
    component: Devices,
    layout: 'admin'
  },
  {
    layout: 'admin',
    path: 'add_device',
    redirect: true,
    component: AddDevice
  },
  {
    layout: 'admin',
    path: 'connect_device',
    redirect: true,
    component: ConnectDevice
  },
  {
    path: 'wireless',
    name: 'Wifi',
    icon: faWifi,
    wifi: true,
    component: WirelessConfiguration,
    layout: 'admin'
  },
  {
    path: 'uplink',
    name: 'Uplink',
    icon: faGlobe,
    component: UplinkConfiguration,
    layout: 'admin'
  },
  {
    path: 'mesh',
    name: 'MESH',
    icon: faSitemap,
    component: Mesh,
    layout: 'admin',
    plus: true
  },
  {
    path: 'wireguard',
    name: 'VPN',
    icon: faCircleNodes,
    component: Wireguard,
    layout: 'admin'
  },
  {
    path: 'firewall',
    name: 'Firewall',
    icon: faFireAlt,
    component: Firewall,
    layout: 'admin'
  },
  {
    path: 'pfw',
    name: 'PFW',
    icon: faFire,
    component: PFW,
    layout: 'admin',
    plus: true
  },
  {
    name: 'Traffic',
    icon: faLineChart,
    state: 'trafficCollapse',
    views: [
      {
        path: 'traffic',
        name: 'Bandwidth Summary',
        icon: faLineChart,
        component: Traffic,
        layout: 'admin',
        hidden: Platform.OS == 'ios'
      },
      {
        path: 'timeseries',
        name: 'Bandwidth Timeseries',
        icon: faChartColumn,
        component: TrafficTimeSeries,
        layout: 'admin',
        hidden: Platform.OS == 'ios'
      },
      {
        path: 'signal/strength',
        name: 'Signal Strength',
        icon: faSignal,
        component: SignalStrength,
        layout: 'admin'
      },
      {
        path: 'trafficlist',
        name: 'Traffic',
        icon: faBarChart,
        component: TrafficList,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'DNS',
    state: 'dnsCollapse',
    views: [
      {
        path: 'dnsBlock',
        name: 'Blocklists/Ad-Block',
        icon: faBan,
        component: DNSBlock,
        layout: 'admin'
      },
      {
        path: 'dnsLog/:ips/:text',
        name: 'DNS Log',
        icon: faThList,
        component: DNSLog,
        layout: 'admin'
      },
      {
        path: 'dnsLogEdit',
        name: 'DNS Log Settings',
        icon: faCogs,
        component: DNSLogEdit,
        layout: 'admin'
      },
      {
        path: 'dyndns',
        name: 'Dynamic DNS',
        icon: faArrowCircleUp,
        component: DynDns,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'System',
    state: 'systemCollapse',
    views: [
      {
        path: 'info',
        name: 'System Info',
        icon: faWaveSquare,
        component: SystemInfo,
        layout: 'admin'
      },
      {
        path: 'supernets',
        name: 'Supernetworks',
        icon: faDiagramProject,
        component: Supernetworks,
        layout: 'admin'
      },
      {
        path: 'dhcp',
        name: 'DHCP Table',
        icon: faNetworkWired,
        component: Dhcp,
        layout: 'admin'
      },
      {
        path: 'arp',
        name: 'ARP Table',
        icon: faEthernet,
        component: Arp,
        layout: 'admin'
      },
      {
        path: 'groups',
        name: 'Groups',
        icon: faObjectGroup,
        component: Groups,
        layout: 'admin'
      },
      {
        path: 'tags',
        name: 'Tags',
        icon: faTags,
        component: Tags,
        layout: 'admin'
      },
      {
        path: 'plugins',
        name: 'Plugins',
        icon: faPuzzlePiece,
        component: Plugins,
        layout: 'admin'
      },
      {
        path: 'logs/:containers',
        name: 'Logs',
        icon: faListAlt,
        component: Logs,
        layout: 'admin'
      },
      {
        path: 'auth/',
        name: 'Auth',
        icon: faUser,
        component: AuthSettings,
        layout: 'admin'
      },
      {
        path: 'notifications',
        name: 'Notifications',
        icon: faBell,
        component: Notifications,
        layout: 'admin'
      },
      {
        path: 'speedtest',
        name: 'Speed Test',
        icon: faGauge,
        component: SpeedTest,
        layout: 'admin'
      }
    ]
  },
  {
    path: 'login',
    component: Login,
    layout: 'auth'
  },
  {
    path: 'setup',
    component: Setup,
    layout: 'auth'
  }
]

const getRoutes = (routes, layout = 'admin') => {
  return routes
    .map((prop, key) => {
      if (prop.views) {
        return getRoutes(prop.views, layout)
      }

      if (prop.layout && prop.layout.includes(layout)) {
        return { path: prop.path, element: prop.component }
      } else {
        return null
      }
    })
    .filter((r) => r)
    .flat()
}

const routesAuth = getRoutes(routes, 'auth')
const routesAdmin = getRoutes(routes, 'admin')

export { routes, routesAuth, routesAdmin }

export default routes
