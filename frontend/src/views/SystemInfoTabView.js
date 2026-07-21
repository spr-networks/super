import React from 'react'

import SystemInfo from 'views/System/SystemInfo'
import SystemInfoContainers from 'views/System/SystemInfoContainers'
import SystemInfoNetworkMisc from 'views/System/SystemInfoNetworkMisc'
import VirtualMachines from 'views/System/VirtualMachines'

import TabView from 'components/TabView'

const SystemInfoTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'System', component: SystemInfo },
        { title: 'Containers', component: SystemInfoContainers },
        { title: 'Virtual Machines', component: VirtualMachines },
        { title: 'Network Info', component: SystemInfoNetworkMisc }
      ]}
    />
  )
}

export default SystemInfoTabView
