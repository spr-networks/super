import React, { useCallback, useEffect, useState } from 'react'
import { Text } from '@gluestack-ui/themed'

import { firewallAPI } from 'api'
import ContainerInterfaceRulesList from 'components/Firewall/ContainerInterfaceRulesList'
import { findContainerAccessRule } from 'views/Devices/deviceTypes'

const ContainerAccessRule = ({ device }) => {
  const [rule, setRule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const refreshRule = useCallback(() => {
    setLoading(true)
    firewallAPI
      .config()
      .then((config) => {
        setRule(
          findContainerAccessRule(config?.CustomInterfaceRules || [], device)
        )
        setLoadError('')
      })
      .catch(() => {
        setRule(null)
        setLoadError('Failed to load the Custom Interface Access rule')
      })
      .finally(() => setLoading(false))
  }, [device])

  useEffect(() => {
    refreshRule()
  }, [refreshRule])

  if (loading) {
    return <Text color="$muted500">Loading Custom Interface Access…</Text>
  }

  if (loadError) {
    return <Text color="$error600">{loadError}</Text>
  }

  return (
    <ContainerInterfaceRulesList
      title="Custom Interface Access"
      list={rule ? [rule] : []}
      notifyChange={refreshRule}
      allowAdd={false}
      allowDelete={false}
      emptyText="No Custom Interface Access rule is linked to this container"
    />
  )
}

export default ContainerAccessRule
