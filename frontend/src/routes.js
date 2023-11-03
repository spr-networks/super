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
import Mesh from 'views/Mesh'
import Logs from 'views/Logs'
import Events from 'views/Events'
import Plugins from 'views/Plugins'
import AuthSettings from 'views/AuthSettings'
import SystemInfo from 'views/SystemInfo'
import Notifications from 'views/Notifications'
import SpeedTest from 'views/SpeedTest'
import Supernetworks from 'views/Supernetworks'

import {
  ActivityIcon,
  ArrowUpCircleIcon,
  BanIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  BellIcon,
  CableIcon,
  EyeIcon,
  FlameIcon,
  GaugeIcon,
  GlobeIcon,
  HammerIcon,
  HomeIcon,
  KeyIcon,
  LaptopIcon,
  LineChartIcon,
  ListTreeIcon,
  PuzzleIcon,
  ScanSearchIcon,
  SeparatorVerticalIcon,
  Settings2Icon,
  SettingsIcon,
  ShuffleIcon,
  SignalIcon,
  Table2Icon,
  TableIcon,
  TagsIcon,
  TargetIcon,
  UsersIcon,
  WaypointsIcon,
  WifiIcon
} from 'lucide-react-native'

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
    path: 'uplink',
    name: 'Uplink',
    icon: GlobeIcon,
    component: UplinkConfiguration,
    layout: 'admin'
  },
  {
    path: 'lanlink',
    name: 'LAN',
    icon: CableIcon,
    component: LANLinkConfiguration,
    layout: 'admin'
  },
  {
    path: 'mesh',
    name: 'MESH',
    icon: TargetIcon,
    component: Mesh,
    layout: 'admin',
    plus: true
  },
  {
    path: 'wireguard',
    name: 'VPN',
    icon: WaypointsIcon,
    component: Wireguard,
    layout: 'admin'
  },

  {
    name: 'Firewall',
    icon: FlameIcon,
    state: 'firewallCollapse',
    views: [
      {
        path: 'firewall',
        name: 'Firewall',
        icon: FlameIcon,
        component: Firewall,
        layout: 'admin'
      },
      {
        path: 'firewallSettings',
        name: 'Services',
        icon: Settings2Icon,
        component: FirewallSettings,
        layout: 'admin'
      },
      {
        path: 'pfw',
        name: 'PFW',
        icon: FlameIcon,
        component: PFW,
        layout: 'admin',
        plus: true
      },
      {
        path: 'supernets',
        name: 'Supernetworks',
        icon: SeparatorVerticalIcon,
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
        path: 'dnsLogEdit',
        name: 'DNS Log Settings',
        icon: SettingsIcon,
        component: DNSLogEdit,
        layout: 'admin'
      },
      {
        path: 'dyndns',
        name: 'Dynamic DNS',
        icon: ArrowUpCircleIcon,
        component: DynDns,
        layout: 'admin'
      },
      {
        path: 'dns',
        name: 'DNS Settings',
        icon: HammerIcon,
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
        component: SignalStrength,
        layout: 'admin'
      },
      {
        path: 'trafficlist',
        name: 'Traffic',
        icon: BarChartHorizontalIcon,
        component: TrafficList,
        layout: 'admin'
      }
    ]
  },
  {
    name: 'Events',
    state: 'eventsCollapse',
    views: [
      {
        path: 'events',
        name: 'Events',
        icon: EyeIcon,
        component: Events,
        layout: 'admin'
      },
      {
        path: 'logs/:containers',
        name: 'Logs',
        icon: ScanSearchIcon,
        component: Logs,
        layout: 'admin'
      },
      {
        path: 'notifications',
        name: 'Notifications',
        icon: BellIcon,
        component: Notifications,
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
        icon: ActivityIcon,
        component: SystemInfo,
        layout: 'admin'
      },
      {
        path: 'plugins',
        name: 'Plugins',
        icon: PuzzleIcon,
        component: Plugins,
        layout: 'admin'
      },
      {
        path: 'auth/',
        name: 'Auth',
        icon: KeyIcon,
        component: AuthSettings,
        layout: 'admin'
      },
      {
        path: 'dhcp',
        name: 'DHCP Table',
        icon: TableIcon,
        component: Dhcp,
        layout: 'admin'
      },
      {
        path: 'arp',
        name: 'ARP Table',
        icon: Table2Icon,
        component: Arp,
        layout: 'admin'
      },
      {
        path: 'groups',
        name: 'Groups',
        icon: UsersIcon,
        component: Groups,
        layout: 'admin'
      },
      {
        path: 'tags',
        name: 'Tags',
        icon: TagsIcon,
        component: Tags,
        layout: 'admin'
      },

      {
        path: 'speedtest',
        name: 'Speed Test',
        icon: GaugeIcon,
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
