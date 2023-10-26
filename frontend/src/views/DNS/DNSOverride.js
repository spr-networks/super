import React, { useContext, useEffect, useState } from 'react'

import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import {
  ScrollView,
  Fab,
  FabIcon,
  FabLabel,
  AddIcon,
  View,
  VStack
} from '@gluestack-ui/themed'

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
    <View h="$full">
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
          title="Permit Domain Override"
          notifyChange={notifyChange}
        />
      </VStack>

      {/*
      <Fab
        size="md"
        placement="bottom right"
        isHovered={false}
        isDisabled={false}
        isPressed={false}
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Block</FabLabel>
      </Fab>
      <Fab
        action="secondary"
        size="md"
        placement="bottom right"
        mr="$40"
        isHovered={false}
        isDisabled={false}
        isPressed={false}
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Permit</FabLabel>
      </Fab>
      */}
    </View>
  )
}

export default DNSBlock
