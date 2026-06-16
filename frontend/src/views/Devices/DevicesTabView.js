import React from 'react'

import Devices from 'views/Devices/Devices'
import DevicesBulkEdit from 'views/Devices/DevicesBulkEdit'

import TabView from 'components/TabView'

const DevicesTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'Devices', component: Devices },
        { title: 'Bulk Edit', component: DevicesBulkEdit }
      ]}
    />
  )
}

export default DevicesTabView
