import React, { useContext, useEffect, useState } from 'react'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Icon,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react-native'

import { api } from 'api'
import { AlertContext } from 'AppContext'

const DRIFT_WARN_SECONDS = 60

// Display drift between SPR's clock and the browser's clock, with a
// "Sync Now" button that asks the host to re-poll NTP via systemd-timesyncd.
// `hideWhenSynced` keeps it out of the way unless there's actually a problem.
const TimeSync = ({ hideWhenSynced = false }) => {
  const context = useContext(AlertContext)
  const [drift, setDrift] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // Compare router clock to this device's clock. We don't know which side
  // is wrong if they differ, but for OTP setup what matters is that the
  // device that scans the QR (typically the same one in your hand) and the
  // server agree.
  const check = () =>
    api.get('/time').then((r) => {
      if (typeof r?.unix !== 'number') return
      setDrift(r.unix - Math.floor(Date.now() / 1000))
    })

  useEffect(() => {
    check()
  }, [])

  const sync = () => {
    setSyncing(true)
    api
      .put('/time/sync')
      .then(() => {
        // give timesyncd a moment, then re-check
        setTimeout(() => check().finally(() => setSyncing(false)), 2500)
        context.success('Time sync requested')
      })
      .catch((e) => {
        setSyncing(false)
        context.error('Time sync failed: ' + (e?.message || e))
      })
  }

  if (drift === null) return null
  const off = Math.abs(drift) > DRIFT_WARN_SECONDS
  if (!off && hideWhenSynced) return null

  return (
    <Box
      mx="$4"
      mb="$4"
      p="$3"
      borderWidth={1}
      borderColor={off ? '$amber400' : '$muted300'}
      bg={off ? '$amber50' : '$backgroundCardLight'}
      sx={{ _dark: { bg: off ? '$amber900' : '$backgroundCardDark' } }}
      rounded="$md"
    >
      <HStack space="sm" alignItems="center">
        {off ? <Icon as={AlertCircleIcon} color="$amber600" /> : null}
        <VStack flex={1} space="xs">
          <Text fontWeight="$bold" size="sm">
            {off ? 'Clock mismatch with this device' : 'Router clock'}
          </Text>
          <Text size="sm" color="$muted500">
            Router differs from this device by {drift > 0 ? '+' : ''}
            {drift}s.
            {off
              ? ' OTP and TLS depend on accurate time. Verify your device’s clock first, then sync the router if needed.'
              : ''}
          </Text>
        </VStack>
        <Button size="xs" onPress={sync} isDisabled={syncing}>
          <ButtonText>{syncing ? 'Syncing…' : 'Sync Now'}</ButtonText>
          <ButtonIcon as={RefreshCwIcon} ml="$1" />
        </Button>
      </HStack>
    </Box>
  )
}

export default TimeSync
