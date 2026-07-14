import React from 'react'

import SpeedTest from 'views/SpeedTest'
import WanHealth from 'views/WanHealth'

import TabView from 'components/TabView'

const WanHealthTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'Health', component: WanHealth },
        { title: 'Speed Test', component: SpeedTest }
      ]}
    />
  )
}

export default WanHealthTabView
