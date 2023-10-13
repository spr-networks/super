import React, { Component, useEffect, useState } from 'react'
import { wireguardAPI } from 'api'
import StatsWidget from './StatsWidget'
import {
  faBan,
  faCircleNodes,
  faEarth,
  faLaptop,
  faWifi
} from '@fortawesome/free-solid-svg-icons'
import { Icon } from 'FontAwesomeUtils'

import { Box, HStack, Text, VStack, useColorMode } from '@gluestack-ui/themed'
import { WifiIcon } from 'lucide-react-native'

const ServicesEnabled = ({ features, ...props }) => {
  useEffect(() => {}, [])

  return (
    <Box
      bg={
        useColorMode() == 'light'
          ? '$backgroundCardLight'
          : '$backgroundCardDark'
      }
      borderRadius={10}
      shadow={4}
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
            bg={features?.wifi ? '$success400' : '$muted300'}
          >
            <Icon icon={faWifi} size={8} color="$white" />
          </Box>
          <Text alignSelf="center">WiFi</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features?.dns ? '$success400' : '$muted300'}
          >
            <Icon icon={faEarth} size={8} color="$white" />
          </Box>
          <Text alignSelf="center">DNS</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features?.dns ? '$success400' : '$muted300'}
          >
            <Icon icon={faBan} size={8} color="$white" />
          </Box>
          <Text alignSelf="center">Block</Text>
        </VStack>

        <VStack space="md">
          <Box
            p="$4"
            rounded="$full"
            bg={features?.vpn ? '$success400' : '$muted300'}
          >
            <Icon icon={faCircleNodes} size={8} color="white" />
          </Box>
          <Text alignSelf="center">VPN</Text>
        </VStack>
      </HStack>
    </Box>
  )
}

export { ServicesEnabled }
