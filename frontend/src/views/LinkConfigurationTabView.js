import React from 'react'

import LANLinkConfiguration from 'views/LinkConfiguration/LANLinkConfiguration'
import UplinkConfiguration from 'views/LinkConfiguration/UplinkConfiguration'

import TabView from 'components/TabView'

const LinkConfigurationTabView = (props) => {
  return (
    <TabView
      tabs={[
        {
          title: 'Uplinks',
          component: UplinkConfiguration
        },
        { title: 'LAN/Downlinks', component: LANLinkConfiguration }
      ]}
    />
  )
}

export default LinkConfigurationTabView
