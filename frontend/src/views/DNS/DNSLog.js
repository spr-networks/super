import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import { View } from '@gluestack-ui/themed'

const DNSLog = (props) => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [ips, setIps] = useState([])

  const params = useParams()

  useEffect(() => {
    let { ips, text } = params
    if (ips && ips != ':ips') {
      setIps(ips.split(','))
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
      <DNSLogHistoryList ips={ips} filterText={filterText} />
    </View>
  )
}

export default DNSLog
