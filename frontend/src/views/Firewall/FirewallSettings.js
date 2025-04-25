import React from 'react'
import {
  ActivityIcon,        // For ICMP/Ping activity
  ServerIcon,          // For Upstream Services/ports
  RadioIcon,       // For MDNS/multicast
} from 'lucide-react-native'
import TabView from 'components/TabView'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'
import ICMP from 'components/Firewall/ICMP'
import MDNSAdvertise from 'components/Firewall/MDNSAdvertise'

const FWSettings = (props) => {
  const tabs = [
    {
      title: 'ICMP Settings',
      icon: ActivityIcon,     // Activity/ping icon makes sense for ICMP
      component: () => <ICMP />
    },
    {
      title: 'Upstream Services',
      icon: ServerIcon,       // Server icon for service ports
      component: () => <UpstreamServicesList />
    },
    {
      title: 'MDNS Advertise',
      icon: RadioIcon,    // Broadcast icon for multicast names
      component: () => <MDNSAdvertise />
    }
  ]

  return (
    <TabView
      tabs={tabs}
    />
  )
}

export default FWSettings
