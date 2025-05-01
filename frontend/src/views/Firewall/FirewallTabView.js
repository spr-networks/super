import React, { useState, useEffect } from 'react'

import { firewallAPI } from 'api'
import EndpointList from 'components/Firewall/EndpointList'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import OutputBlockList from 'components/Firewall/OutputBlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import MulticastPorts from 'components/Firewall/MulticastPorts'
import ContainerInterfaceRulesList from 'components/Firewall/ContainerInterfaceRulesList'

import {
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  BanIcon,
  CastIcon,
  ContainerIcon,
  RouteIcon,
  RouteOffIcon,
  ShieldBan,
  SplitIcon,
  WaypointsIcon
} from 'lucide-react-native'

import TabView from 'components/TabView'


const FirewallTabView = (props) => {
  const [config, setConfig] = useState({})
  const [activeTab, setActiveTab] = useState(0) // Default to first tab

  const fetchConfig = () => {
    firewallAPI.config().then(setConfig)
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const tabs = [
     {
       title: 'Port Forwarding',
       icon: SplitIcon,
       component: () => (
         <ForwardList list={config.ForwardingRules} notifyChange={fetchConfig} />
       )
     },
     {
       title: 'Inbound Traffic Block',
       icon: ArrowLeftToLineIcon,
       component: () => (
         <BlockList
           title="Inbound Traffic Block"
           list={config.BlockRules}
           notifyChange={fetchConfig}
         />
       )
     },
     {
       title: 'Forwarding Traffic Block',
       icon: ArrowRightFromLineIcon,
       component: () => (
         <ForwardBlockList
           title="Forwarding Traffic Block"
           list={config.ForwardingBlockRules}
           notifyChange={fetchConfig}
         />
       )
     },
     {
       title: 'Endpoints',
       icon: RouteIcon,
       component: () => (
         <EndpointList list={config.Endpoints} notifyChange={fetchConfig} />
       )
     },
     {
       title: 'Custom Interface Access',
       icon: ContainerIcon,
       component: () => (
         <ContainerInterfaceRulesList
           title="Custom Interface Access"
           list={config.CustomInterfaceRules}
           notifyChange={fetchConfig}
         />
       )
     },
     {
       title: 'Multicast Proxy',
       icon: CastIcon,
       component: () => (
         <MulticastPorts
           list={config.MulticastPorts}
           notifyChange={fetchConfig}
         />
       )
     },
     {
       title: 'SPR Outbound Block',
       icon: ShieldBan,
       component: () => (
         <OutputBlockList
           list={config.OutputBlockRules}
           notifyChange={fetchConfig}
         />
       )
     }
   ]
  return (
    <TabView
      tabs={tabs}
    />
  )
}

export default FirewallTabView
