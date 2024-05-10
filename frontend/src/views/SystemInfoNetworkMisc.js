import React, { useContext, useEffect, useState } from 'react'

import {
  Box,
  Heading,
  HStack,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Icon,
  Text,
  VStack,
  ScrollView,
  useColorMode
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

import Arp from 'views/Devices/Arp'

const SystemInfoNetworkMisc = (props) => {
  const context = useContext(AlertContext)

  const colorMode = useColorMode()
  const item = {}

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="md">
        <HStack p="$4">
          <Heading size="md">Network Info</Heading>
        </HStack>

        <Arp />
      </VStack>
    </ScrollView>
  )
}

export default SystemInfoNetworkMisc
