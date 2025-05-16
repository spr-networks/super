import React, { useState, useEffect } from 'react'

import Alerts from 'views/Alerts'
import AlertSettings from 'views/AlertSettings'

import {
  AlertTriangleIcon,
  Settings2Icon,
  PlusIcon
} from 'lucide-react-native'

import TabView from 'components/TabView'

const AlertsTabView = (props) => {
  const [activeTab, setActiveTab] = useState(0) // Default to first tab

  const tabs = [
     {
       title: 'Alerts',
       icon: AlertTriangleIcon,
       component: () => <Alerts />,
     },
     {
       title: 'Settings',
       icon: Settings2Icon,
       component: () => <AlertSettings />,
     },
   ]

  return (
    <TabView
      tabs={tabs}
    />
  )
}

export default AlertsTabView
