import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import { AppContext, alertState } from 'AppContext'

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

const ICMP = (props) => {
  const [status, setStatus] = useState({ PingLan: false, PingWan: false })

  const contextType = useContext(AppContext)

  useEffect(() => {
    firewallAPI.config().then((config) => {
      setStatus({ PingLan: config.PingLan, PingWan: config.PingWan })
    })
  }, [])

  const togglePing = (key) => {
    let updated = { ...status, [key]: !status[key] }
    firewallAPI
      .setICMP(updated)
      .then(() => {
        alertState.success('Updated Ping Settings')
      })
      .catch((err) => alertState.error(err))

    setStatus(updated)
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            Ping Settings
          </Heading>
          <Text color="muted.500" isTruncated>
            Allow ping on LAN or WAN network
          </Text>
        </VStack>
      </HStack>

      <VStack>
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
              isChecked={status.PingLan}
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
              isChecked={status.PingWan}
              onValueChange={() => togglePing('PingWan')}
            />
          </HStack>
        </Box>
      </VStack>
    </>
  )
}

export default ICMP
