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

import { Box, HStack, Text, VStack, useColorModeValue } from 'native-base'

const ServicesEnabled = (props) => {
  useEffect(() => {}, [])

  return (
    <Box
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      borderRadius={10}
      mb={4}
      shadow={4}
      flex={1}
    >
      <HStack
        space={8}
        justifyContent="space-around"
        p={4}
        rounded="lg"
        flexWrap="wrap"
      >
        <VStack space={2}>
          <Box p={4} rounded="full" bg="primary.500">
            <Icon icon={faWifi} size={8} color="white" />
          </Box>
          <Text alignSelf="center">AP on</Text>
        </VStack>

        <VStack space={2}>
          <Box p={4} rounded="full" bg="primary.500">
            <Icon icon={faEarth} size={8} color="white" />
          </Box>
          <Text alignSelf="center">DNS on</Text>
        </VStack>

        <VStack space={2}>
          <Box p={4} rounded="full" bg="primary.500">
            <Icon icon={faBan} size={8} color="white" />
          </Box>
          <Text alignSelf="center">Block on</Text>
        </VStack>

        <VStack space={2}>
          <Box p={4} rounded="full" bg="muted.300">
            <Icon icon={faCircleNodes} size={8} color="white" />
          </Box>
          <Text alignSelf="center">VPN off</Text>
        </VStack>
      </HStack>
    </Box>
  )
}

export { ServicesEnabled }
