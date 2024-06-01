import React from 'react'

import WifiClients from 'components/Wifi/WifiClients'
import WifiInterfaceList from 'components/Wifi/WifiInterfaceList'
import WifiScan from 'components/Wifi/WifiScan'
import WifiHostapd from 'components/Wifi/WifiHostapd'

import { Platform } from 'react-native'

import TabView from 'components/TabView'

const WirelessConfiguration = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'Clients', component: WifiClients },
        { title: 'Interfaces', component: WifiInterfaceList },
        { title: 'Scan', component: WifiScan },
        {
          title: Platform.OS === 'web' ? 'Radio Settings' : 'Settings',
          component: WifiHostapd
        }
      ]}
    />
  )
}

export default WirelessConfiguration
