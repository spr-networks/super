import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'

import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
//import DNSChart from 'components/DNS/DNSChart'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import TabView from 'components/TabView'

const DNSLog = (props) => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [filterIps, setFilterIps] = useState([])

  const params = useParams()

  useEffect(() => {
    let { ips, text } = params
    if (ips && ips != ':ips') {
      setFilterIps(ips.split(','))
    } else {
      AsyncStorage.getItem('select')
        .then((oldSelect) => {
          let select = JSON.parse(oldSelect) || {}
          if (select?.filterIps) {
            setFilterIps(select.filterIps)
          }
        })
        .catch((err) => {})
    }

    if (text && text != ':text') {
      setFilterText(text)
    }

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
