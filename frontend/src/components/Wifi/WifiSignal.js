import React from 'react'

import { prettySignal } from 'utils'

import { HStack, Icon, Text, useColorMode } from '@gluestack-ui/themed'

import { Tooltip } from 'components/Tooltip'

import {
  WifiIcon,
  WifiZeroIcon,
  WifiLowIcon,
  WifiHighIcon
} from 'lucide-react-native'

const WifiSignal = ({ signal, size, label, onlyText, ...props }) => {
  //Wifi,WifiHigh,WifiLow,WifiZero
  //{prettySignal(signal)}

  const colorMode = useColorMode()

  let icon = WifiIcon
  let className = '$muted500'
  if (signal >= -50) {
    className = '$success600'
  } else if (signal >= -60) {
    className = '$success500'
    icon = WifiHighIcon
  } else if (signal >= -70) {
    className = colorMode == 'light' ? '$success300' : '$success800'
    icon = WifiHighIcon
  } else {
    className = '$warning500'
    icon = WifiLowIcon
  }

  if (onlyText) {
    return <Text color={className}>{signal}</Text>
  }

  return (
    <Tooltip label={label || `RSSI: ${signal}`}>
      <HStack space="md" alignItems="center">
        <HStack _bg="$muted100" _rounded="$full" _p="$2">
          <Icon as={WifiIcon} size={size || 20} opacity={0.4} />
          <Icon
            as={icon}
            size={size || 20}
            position="absolute"
            color={className}
          />
        </HStack>
      </HStack>
    </Tooltip>
  )
}

export default WifiSignal
