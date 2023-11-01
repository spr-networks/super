import React, { useEffect } from 'react'

import {
  Box,
  HStack,
  Icon,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import {
  BanIcon,
  GlobeIcon,
  WaypointsIcon,
  WifiIcon
} from 'lucide-react-native'

const ServicesEnabled = ({ features, ...props }) => {
  useEffect(() => {}, [])

  const colorMode = useColorMode()
  //$success400
  const colorOn = colorMode == 'light' ? '$blueGray500' : '$blueGray600',
    colorOff = colorMode == 'light' ? '$muted300' : '$muted500'

  return (
    <Box
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      borderRadius={10}
    >
      <HStack
        space="lg"
        justifyContent="space-around"
        p="$4"
        rounded="lg"
        flexWrap="wrap"
      >
        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features.includes('wifi') ? colorOn : colorOff}
          >
            <Icon as={WifiIcon} color="$white" size={32} />
          </Box>
          <Text alignSelf="center">WiFi</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features.includes('dns') ? colorOn : colorOff}
          >
            <Icon as={GlobeIcon} color="$white" size={32} />
          </Box>
          <Text alignSelf="center">DNS</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features.includes('dns-block') ? colorOn : colorOff}
          >
            <Icon as={BanIcon} color="$white" size={32} />
          </Box>
          <Text alignSelf="center">Block</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features.includes('wireguard') ? colorOn : colorOff}
          >
            <Icon as={WaypointsIcon} color="$white" size={32} />
          </Box>
          <Text alignSelf="center">VPN</Text>
        </VStack>
      </HStack>
    </Box>
  )
}

export { ServicesEnabled }
