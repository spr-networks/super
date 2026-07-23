import React from 'react'
import { useLocation } from 'react-router-dom'

import Devices from 'views/Devices/Devices'
import Containers from 'views/Devices/Containers'
import DevicesBulkEdit from 'views/Devices/DevicesBulkEdit'
import Classification from 'views/Devices/Classification'
import Personas from 'views/Devices/Personas'

import TabView from 'components/TabView'
import {
  ContainerIcon,
  FingerprintIcon,
  UserIcon
} from 'lucide-react-native'

const DevicesTabView = (props) => {
  const location = useLocation()

  const tabTitles = [
    'Devices',
    'Containers',
    'Bulk Edit',
    'Personas',
    'Classification'
  ]
  const initialIndex = Math.max(0, tabTitles.indexOf(location.state?.tab))

  return (
    <TabView
      initialIndex={initialIndex}
      tabs={[
        { title: 'Devices', component: Devices },
        {
          title: 'Containers',
          icon: ContainerIcon,
          component: Containers
        },
        { title: 'Bulk Edit', component: DevicesBulkEdit },
        { title: 'Personas', icon: UserIcon, component: Personas },
        { title: 'Classification', icon: FingerprintIcon, component: Classification }
      ]}
    />
  )
}

export default DevicesTabView
