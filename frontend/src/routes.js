import { Platform } from 'react-native'

import AddDevice from 'views/Devices/AddDevice'
import {WifiConnect} from 'views/Devices/ConnectDevice'
import Devices from 'views/Devices/Devices'
import Device from 'views/Devices/Device'
import Home from 'views/Home'
import Login from 'views/pages/Login'
import Setup from 'views/pages/Setup'
import SignalStrength from 'views/Traffic/SignalStrength'
import Traffic from 'views/Traffic/Traffic'
import TrafficTimeSeries from 'views/Traffic/TrafficTimeSeries'
import TrafficList from 'views/Traffic/TrafficList'
import WirelessConfiguration from 'views/WirelessConfiguration'
import Groups from 'views/Groups/Groups'
import Tags from 'views/Tags'
import DNSBlock from 'views/DNS/DNSBlock'
import DNSOverride from 'views/DNS/DNSOverride'
import DNSLog from 'views/DNS/DNSLog'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import DynDns from 'views/DNS/DynDns'
import CoreDns from 'views/DNS/CoreDns'
import Wireguard from 'views/Wireguard'
import Firewall from 'views/Firewall/Firewall'
import FirewallTabView from 'views/Firewall/FirewallTabView'
import FirewallSettings from 'views/Firewall/FirewallSettings'
import PFW from 'views/Firewall/Pfw'
import PFWTasks from 'views/System/PfwTasks'
import Mesh from 'views/Mesh'
import Events from 'views/Events'
import Plugins from 'views/Plugins'
import AuthSettings from 'views/AuthSettings'
import AuthValidate from 'views/AuthValidate'
import SystemInfoTabView from 'views/SystemInfoTabView'
import LinkConfigurationTabView from 'views/LinkConfigurationTabView'

import AlertsTabView from 'views/AlertsTabView'

import Alerts from 'views/Alerts'
import AlertSettings from 'views/AlertSettings'
import AddAlert from 'views/Alerts/AddAlert'
import SpeedTest from 'views/SpeedTest'
import Supernetworks from 'views/Supernetworks'

import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowUpCircleIcon,
  BanIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  BellIcon,
  CableIcon,
  CogIcon,
  ContainerIcon,
  EarthLockIcon,
  EyeIcon,
  FlameIcon,
  GaugeCircleIcon,
  GaugeIcon,
  GlobeIcon,
  HammerIcon,
  HomeIcon,
  KeyIcon,
  LaptopIcon,
  LineChartIcon,
  ListTreeIcon,
  NetworkIcon,
  PuzzleIcon,
  Repeat2,
  RouterIcon,
  ScanSearchIcon,
  SeparatorVerticalIcon,
  Settings2Icon,
  SettingsIcon,
  ShuffleIcon,
  SignalIcon,
  Table2Icon,
  TableIcon,
  TagsIcon,
  UsersIcon,
  WaypointsIcon,
  WifiIcon
} from 'lucide-react-native'
import CustomPlugin from 'views/CustomPlugin'

//import { BrandIcons } from 'IconUtils'

const routes = [
  {
    path: 'home',
    name: 'Home',
    icon: HomeIcon,
    component: Home,
    layout: 'admin'
  },
  {
    name: 'Devices',
    icon: LaptopIcon,
    path: 'devices',
    component: Devices,
    layout: 'admin'
  },
  {
    name: 'Device',
    path: 'devices/:id',
    component: Device,
    hidden: true,
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
    component: WifiConnect
  },
  {
    name: 'Network',
    state: 'netCollapse',
    views: [
      {
        path: 'wireless',
        name: 'Wifi',
        icon: WifiIcon,
        wifi: true,
        component: WirelessConfiguration,
        layout: 'admin'
      },
      {
        path: 'wireguard',
        name: 'VPN',
        icon: EarthLockIcon,
        component: Wireguard,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'supernets',
        name: 'DHCP Settings',
        icon: NetworkIcon,
        hideSimple: true,
        component: Supernetworks,
        layout: 'admin'
      },
      {
        path: 'uplink',
        name: 'Link Settings',
        icon: WaypointsIcon,
        component: LinkConfigurationTabView,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'mesh',
        name: 'MESH',
        icon: RouterIcon,
        component: Mesh,
        hideSimple: true,
        layout: 'admin',
        plus: true
      },
      {
        path: 'speedtest',
        name: 'Speed Test',
        icon: GaugeCircleIcon,
        component: SpeedTest,
        hideSimple: true,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'Firewall',
    icon: FlameIcon,
    state: 'firewallCollapse',
    hideSimple: true,
    views: [
      {
        path: 'firewall',
        name: 'Firewall',
        icon: FlameIcon,
        component: FirewallTabView,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'firewallSettings',
        name: 'Services',
        icon: Settings2Icon,
        hideSimple: true,
        component: FirewallSettings,
        layout: 'admin'
      },
      {
        path: 'pfw',
        name: 'PFW',
        icon: FlameIcon,
        component: PFW,
        hideSimple: true,
        layout: 'admin',
        plus: true
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
        icon: BanIcon,
        component: DNSBlock,
        layout: 'admin'
      },
      {
        path: 'dnsLog/:ips/:text',
        name: 'DNS Log',
        icon: ListTreeIcon,
        component: DNSLog,
        layout: 'admin'
      },
      {
        path: 'dnsLogEdit',
        name: 'DNS Log Settings',
        icon: ListTreeIcon,
        component: DNSLogEdit,
        layout: 'admin',
        hidden: true
      },
      {
        path: 'dyndns',
        name: 'Dynamic DNS',
        icon: ArrowUpCircleIcon,
        hideSimple: true,
        component: DynDns,
        layout: 'admin'
      },
      {
        path: 'dns',
        name: 'DNS Settings',
        icon: HammerIcon,
        hideSimple: true,
        component: CoreDns,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'Traffic',
    icon: LineChartIcon,
    state: 'trafficCollapse',
    views: [
      {
        path: 'traffic',
        name: 'Bandwidth Summary',
        icon: LineChartIcon,
        component: Traffic,
        layout: 'admin',
        hidden: Platform.OS == 'ios'
      },
      {
        path: 'timeseries',
        name: 'Bandwidth Timeseries',
        icon: BarChart3Icon,
        component: TrafficTimeSeries,
        layout: 'admin',
        hidden: Platform.OS == 'ios'
      },
      {
        path: 'signal/strength',
        name: 'Signal Strength',
        icon: SignalIcon,
        hideSimple: true,
        component: SignalStrength,
        layout: 'admin'
      },
      {
        path: 'trafficlist/:ips',
        name: 'Traffic',
        icon: BarChartHorizontalIcon,
        component: TrafficList,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'Monitor',
    state: 'eventsCollapse',
    hideSimple: true,
    views: [
      {
        path: 'alerts',
        name: 'Alerts',
        icon: AlertTriangleIcon,
        component: AlertsTabView,
        layout: 'admin'
      },
      {
        name: 'Alert',
        path: 'alerts/:id',
        component: AddAlert,
        hidden: true,
        layout: 'admin'
      },
      {
        path: 'events',
        name: 'Events',
        icon: EyeIcon,
        component: Events,
        layout: 'admin'
      },
      {
        path: 'pfw_tasks',
        name: 'Tasks',
        icon: Repeat2,
        component: PFWTasks,
        hideSimple: true,
        layout: 'admin',
        plus: true
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
        icon: ActivityIcon,
        component: SystemInfoTabView,
        layout: 'admin'
      },
      {
        path: 'plugins',
        name: 'Plugins',
        icon: PuzzleIcon,
        component: Plugins,
        hideSimple: true,
        layout: 'admin'
      },
      {
        layout: 'admin',
        path: 'custom_plugin/:name',
        redirect: true,
        component: CustomPlugin
      },
      {
        path: 'auth/',
        name: 'Auth',
        icon: KeyIcon,
        component: AuthSettings,
        hideSimple: true,
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
  },
  {
    path: 'validate',
    component: AuthValidate,
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
