import React, { useContext, useEffect, useState } from 'react'

import {
  Badge,
  BadgeText,
  Box,
  HStack,
  Switch,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'
import { deviceAPI, wifiAPI } from 'api'
import { pmfAdvice, pmfLockedOn, pmfStationSummary } from 'api/WifiPMF'
import { ListHeader } from 'components/List'

const WifiPMF = ({ iface, config, onUpdate }) => {
  const context = useContext(AlertContext)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSummary(null)
    if (!iface) {
      return
    }
    Promise.all([
      wifiAPI.allStations(iface),
      deviceAPI.list().catch(() => ({}))
    ])
      .then(([stations, devices]) =>
        setSummary(pmfStationSummary(stations, devices))
      )
      .catch(() => setSummary(null))
  }, [iface])

  const lockedOn = pmfLockedOn(config)
  const required = lockedOn || config.pmf_required === true
  const advice = pmfAdvice(config, summary)

  const setRequired = (value) => {
    setBusy(true)
    wifiAPI
      .updateConfig(iface, { Pmf_required: value })
      .then((conf) => onUpdate(conf))
      .catch((err) => context.error('PMF update failed', err))
      .finally(() => setBusy(false))
  }

  return (
    <VStack>
      <ListHeader title="Protected Management Frames" />
      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        <VStack space="md">
          <HStack space="md" alignItems="center">
            <Switch
              size="sm"
              value={required}
              isDisabled={busy || lockedOn}
              onValueChange={setRequired}
            />
            <Text size="sm">Require PMF (802.11w)</Text>
            {advice.suggest ? (
              <Badge action="info" variant="outline">
                <BadgeText>Suggested</BadgeText>
              </Badge>
            ) : null}
          </HStack>
          <Text size="sm" color="$muted500">
            {advice.text}
          </Text>
        </VStack>
      </Box>
    </VStack>
  )
}

export default WifiPMF
