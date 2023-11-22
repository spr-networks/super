import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'

import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import { View } from '@gluestack-ui/themed'

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

  return (
    <View>
      <DNSLogHistoryList ips={filterIps} filterText={filterText} />
    </View>
  )
}

export default DNSLog
