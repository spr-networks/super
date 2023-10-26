import React, { useEffect, useState } from 'react'

import { firewallAPI } from 'api'
import { alertState } from 'AppContext'

import { VStack, Switch, Text } from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

const ICMP = (props) => {
  const [status, setStatus] = useState({ PingLan: false, PingWan: false })

  useEffect(() => {
    firewallAPI.config().then((config) => {
      setStatus({ PingLan: config.PingLan, PingWan: config.PingWan })
    })
  }, [])

  const togglePing = (key) => {
    let updated = { ...status, [key]: !status[key] }
    firewallAPI
      .setICMP(updated)
      .then(() => {
        alertState.success('Updated Ping Settings')
      })
      .catch((err) => alertState.error(err))

    setStatus(updated)
  }

  return (
    <VStack>
      <ListHeader
        title="Ping Settings"
        description="Allow ping on LAN or WAN network"
      />

      {['PingLan', 'PingWan'].map((d) => (
        <ListItem key={d}>
          <Text bold>{d.replace(/^Ping/, '').toUpperCase()}</Text>

          <Switch value={status[d]} onValueChange={() => togglePing(d)} />
        </ListItem>
      ))}
    </VStack>
  )
}

export default ICMP
