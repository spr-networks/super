import { Platform } from 'react-native'

import AddDevice from 'views/Devices/AddDevice'
import ConnectDevice from 'views/Devices/ConnectDevice'
import Arp from 'views/Devices/Arp'
import Devices from 'views/Devices/Devices'
import Device from 'views/Devices/Device'
import Dhcp from 'views/Groups/Dhcp'
import Home from 'views/Home'
import Login from 'views/pages/Login'
import Setup from 'views/pages/Setup'
import SignalStrength from 'views/Traffic/SignalStrength'
import Traffic from 'views/Traffic/Traffic'
import TrafficTimeSeries from 'views/Traffic/TrafficTimeSeries'
import TrafficList from 'views/Traffic/TrafficList'
import UplinkConfiguration from 'views/UplinkConfiguration'
import LANLinkConfiguration from 'views/LANLinkConfiguration'
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
import FirewallSettings from 'views/Firewall/FirewallSettings'
import PFW from 'views/Firewall/Pfw'
import PFWTasks from 'views/System/PfwTasks'
import Mesh from 'views/Mesh'
import Events from 'views/Events'
import Plugins from 'views/Plugins'
import AuthSettings from 'views/AuthSettings'
import AuthValidate from 'views/AuthValidate'
import SystemInfo from 'views/SystemInfo'
import SystemInfoTabView from 'views/SystemInfoTabView'
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
    component: ConnectDevice
  },
  {
    path: 'wireless',
    name: 'Wifi',
    icon: WifiIcon,
    wifi: true,
    component: WirelessConfiguration,
    layout: 'admin'
  },
  {
    name: 'Network',
    state: 'netCollapse',
    hideSimple: true,
    views: [
      {
        path: 'uplink',
        name: 'Uplink',
        icon: GlobeIcon,
        component: UplinkConfiguration,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'lanlink',
        name: 'LAN',
        icon: CableIcon,
        component: LANLinkConfiguration,
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
        path: 'wireguard',
        name: 'VPN',
        icon: WaypointsIcon,
        component: Wireguard,
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
        component: Firewall,
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
      },
      {
        path: 'supernets',
        name: 'DHCP Settings',
        icon: NetworkIcon,
        hideSimple: true,
        component: Supernetworks,
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
        icon: BanIcon,
        component: DNSBlock,
        layout: 'admin'
      },
      {
        path: 'dnsOverride',
        name: 'DNS Overrides',
        icon: ShuffleIcon,
        hideSimple: true,
        component: DNSOverride,
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
        component: Alerts,
        layout: 'admin'
      },
      {
        path: 'alerts/settings',
        name: 'Alerts Configuration',
        icon: Settings2Icon,
        component: AlertSettings,
        layout: 'admin',
        hidden: true
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
      },
      {
        path: 'dhcp',
        name: 'DHCP Table',
        icon: TableIcon,
        component: Dhcp,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'arp',
        name: 'ARP Table',
        icon: Table2Icon,
        component: Arp,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'groups',
        name: 'Groups',
        icon: UsersIcon,
        component: Groups,
        hideSimple: true,
        layout: 'admin'
      },
      {
        path: 'tags',
        name: 'Tags',
        icon: TagsIcon,
        component: Tags,
        hideSimple: true,
        layout: 'admin'
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
