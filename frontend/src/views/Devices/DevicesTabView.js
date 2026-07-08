import React from 'react'

import Devices from 'views/Devices/Devices'
import DevicesBulkEdit from 'views/Devices/DevicesBulkEdit'
import Classification from 'views/Devices/Classification'
import Personas from 'views/Devices/Personas'

import TabView from 'components/TabView'
import { FingerprintIcon, UserIcon } from 'lucide-react-native'

const DevicesTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'Devices', component: Devices },
        { title: 'Bulk Edit', component: DevicesBulkEdit },
        { title: 'Personas', icon: UserIcon, component: Personas },
        { title: 'Classification', icon: FingerprintIcon, component: Classification }
      ]}
    />
  )
}

export default DevicesTabView
