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

import DockerInfo from 'views/System/Docker'
import ContainerNetConfiguration from 'views/ContainerNetConfiguration'
import Logs from 'views/Logs'

const SystemInfoContainers = (props) => {
  const context = useContext(AlertContext)

  const colorMode = useColorMode()
  const item = {}

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="md">
        <HStack p="$4">
          <Heading size="md">Container Info</Heading>
        </HStack>

        <ContainerNetConfiguration />
        <DockerInfo />
        <Logs />
      </VStack>
    </ScrollView>
  )
}

export default SystemInfoContainers
