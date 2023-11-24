import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Box,
  HStack,
  Icon,
  Link,
  Pressable,
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
  const navigate = useNavigate()
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
        py="$7"
        rounded="lg"
        flexWrap="wrap"
      >
        <Pressable
          onPress={() => {
            navigate('/admin/wireless')
          }}
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
        </Pressable>

        <Pressable
          onPress={() => {
            navigate('/admin/dnsLog/:ips/:text')
          }}
        >
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
        </Pressable>

        <Pressable onPress={() => navigate('/admin/dnsBlock')}>
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
        </Pressable>

        <Pressable onPress={() => navigate('/admin/wireguard')}>
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
        </Pressable>
      </HStack>
    </Box>
  )
}

export { ServicesEnabled }
