import React, { useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'

import {
  Badge,
  Button,
  Box,
  FlatList,
  Heading,
  IconButton,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

const Multicast = (props) => {
  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            Multicast Settings
          </Heading>
          <Text color="muted.500" isTruncated>
            Configure mdns services
          </Text>
        </VStack>
      </HStack>

      <VStack px={4} width={{ base: '100%', md: '75%' }}></VStack>
    </>
  )
}

export default Multicast
