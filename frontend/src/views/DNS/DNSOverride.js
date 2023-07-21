import React, { useContext, useEffect, useState } from 'react'
import DNSBlocklist from 'components/DNS/DNSBlocklist'
import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import { ScrollView, View, VStack } from 'native-base'

const DNSBlock = (props) => {
  const context = useContext(AlertContext)
  const [enabled, setEnabled] = useState(true)
  const [PermitDomains, setPermitDomains] = useState([])
  const [BlockDomains, setBlockDomains] = useState([])

  const refreshConfig = async () => {
    try {
      let config = await blockAPI.config()

      setBlockDomains(config.BlockDomains)
      setPermitDomains(config.PermitDomains)
    } catch (error) {
      if ([404, 502].includes(error.message)) {
        setEnabled(false)
      } else {
        context.error('API Failure: ' + error.message)
      }
    }
  }

  useEffect(() => {
    refreshConfig()
  }, [])

  const notifyChange = async (type) => {
    if (type == 'config') {
      await refreshConfig()
      return
    }
  }

  if (!enabled) {
    return <PluginDisabled plugin="dns" />
  }

  return (
    <ScrollView>
      <VStack>
        <DNSOverrideList
          key="blockdomain"
          list={BlockDomains}
          title="Block Custom Domain"
          notifyChange={notifyChange}
        />

        <DNSOverrideList
          key="allowdomain"
          list={PermitDomains}
          title="Allow Custom Domain"
          notifyChange={notifyChange}
        />
      </VStack>
    </ScrollView>
  )
}

export default DNSBlock
