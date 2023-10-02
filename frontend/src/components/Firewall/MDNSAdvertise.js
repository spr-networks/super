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

const MDNSAdvertise = (props) => {
  const [status, setStatus] = useState({ PingLan: true, PingWan: false })
  const togglePing = (key) => {
    let updated = { ...status, [key]: !status[key] }

    firewallAPI
      .setICMP(updated)
      .then(() => {
        console.log('updated')
      })
      .catch((err) => console.error(err))

    setStatus(updated)
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            Advertise mDNS Name
          </Heading>
          <Text color="muted.500" isTruncated>
            Broadcast mDNS name on interfaces
          </Text>
        </VStack>
      </HStack>

      <VStack px={4} width={{ base: '100%', md: '75%' }}>
        <Box
          bg="backgroundCardLight"
          borderBottomWidth={1}
          _dark={{
            bg: 'backgroundCardDark',
            borderColor: 'borderColorCardDark'
          }}
          borderColor="borderColorCardLight"
          p={4}
        >
          <HStack space={4} justifyContent="space-between" alignItems="center">
            <Text bold>LAN</Text>

            <Switch
              defaultIsChecked={status.PingLan}
              onValueChange={() => togglePing('PingLan')}
            />
          </HStack>
        </Box>
        <Box
          bg="backgroundCardLight"
          borderBottomWidth={1}
          _dark={{
            bg: 'backgroundCardDark',
            borderColor: 'borderColorCardDark'
          }}
          borderColor="borderColorCardLight"
          p={4}
        >
          <HStack space={4} justifyContent="space-between" alignItems="center">
            <Text bold>WAN</Text>

            <Switch
              defaultIsChecked={status.PingWan}
              onValueChange={() => togglePing('PingWan')}
            />
          </HStack>
        </Box>
      </VStack>
    </>
  )
}

export default MDNSAdvertise
