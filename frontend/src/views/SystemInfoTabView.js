import React from 'react'

import SystemInfo from 'views/System/SystemInfo'
import SystemInfoContainers from 'views/System/SystemInfoContainers'
import SystemInfoNetworkMisc from 'views/System/SystemInfoNetworkMisc'

import TabView from 'components/TabView'

const SystemInfoTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'System', component: SystemInfo },
        { title: 'Containers', component: SystemInfoContainers },
        { title: 'Network Info', component: SystemInfoNetworkMisc }
      ]}
    />
  )
}

export default SystemInfoTabView
