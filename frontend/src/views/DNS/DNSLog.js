import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
//import DNSChart from 'components/DNS/DNSChart'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import TabView from 'components/TabView'

const DNSLog = (props) => {
  const [isEnabled, setIsEnabled] = useState(true)

  const params = useParams()

  const [filterIps] = useState(() =>
    params.ips && params.ips != ':ips' ? params.ips.split(',') : []
  )
  const [filterText] = useState(() =>
    params.text && params.text != ':text' ? params.text : ''
  )

  useEffect(() => {
    logAPI.config().catch((error) => setIsEnabled(false))
  }, [])

  if (!isEnabled) {
    return <PluginDisabled plugin="dns" />
  }

  return <DNSLogHistoryList ips={filterIps} filterText={filterText} />
}

const DNSTabView = (props) => {
  return (
    <TabView
      tabs={[
        { title: 'DNS Log', component: DNSLog },
        { title: 'Log Settings', component: DNSLogEdit }
      ]}
    />
  )
}

export default DNSTabView
