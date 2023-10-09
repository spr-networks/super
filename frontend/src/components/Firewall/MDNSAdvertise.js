import React, { useContext, useRef, useState, useEffect } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import { Multicast } from 'api/Multicast'

import {
  Badge,
  Button,
  Box,
  FlatList,
  Heading,
  IconButton,
  Input,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

import { AppContext, alertState } from 'AppContext'

const MDNSAdvertise = (props) => {
  const [config, setConfig] = useState({
    Disabled: false,
    DisableMDNSAdvertise: false,
    MDNSName: '',
    Addresses: []
  })

  const toggleMDNS = (key) => {
    setConfig({ ...config, DisableMDNSAdvertise: !config.DisableMDNSAdvertise })
  }

  const toggleMulticast = (key) => {
    setConfig({ ...config, Disabled: !config.Disabled })
  }

  const onChangeText = (value) => {
    setConfig({ ...config, MDNSName: value })
  }

  const submitSettings = (value) => {
    Multicast.setConfig(config)
      .then(() => {
        let proxy_mdns = false
        for (let addr of config.Addresses) {
          if (addr.Disabled == false && addr.Address.includes(':5353')) {
            proxy_mdns = true
          }
        }

        if (!config.DisableMDNSAdvertise) {
          //next we need to update the firewall as well
          firewallAPI
            .addMulticastPort({ Port: '5353', Upstream: true })
            .then(() => {
              alertState.success('Updated Multicast Settings')
            })
            .catch((err) => {
              alertState.error('Failed to update firewall rule')
            })
        } else if (proxy_mdns) {
          //instead update to disable from upstream interfaces
          firewallAPI
            .addMulticastPort({ Port: '5353', Upstream: false })
            .then(() => {
              alertState.success('Updated Multicast Settings')
            })
            .catch((err) => {
              alertState.error('Failed to update firewall rule')
            })
        } else {
          //delete the por taltogether
          firewallAPI
            .deleteMulticastPort({ Port: '5353', Upstream: false })
            .then(() => {
              alertState.success('Updated Multicast Settings')
            })
            .catch((err) => {
              alertState.error('Failed to update firewall rule')
            })
        }
      })
      .catch((err) => alertState.error('failed ' + JSON.stringify(err)))
  }

  useEffect(() => {
    Multicast.config().then(setConfig)
  }, [])

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" py={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            Multicast Settings
          </Heading>
          <Text color="muted.500" isTruncated>
            Configure Multicast Proxy
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
            <Text bold>Enable Multicast Proxy</Text>

            <Switch
              isChecked={!config.Disabled}
              onValueChange={() => toggleMulticast()}
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
            <Text bold>Advertise Router over mDNS</Text>

            <Switch
              isChecked={!config.DisableMDNSAdvertise}
              onValueChange={() => toggleMDNS()}
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
          <Stack
            direction={{ base: 'column', md: 'row' }}
            space={4}
            _justifyContent="stretch"
            alignItems={{ base: 'none', md: 'center' }}
          >
            <VStack maxW={{ md: '1/2' }}>
              <Text bold>mDNS Name</Text>
              <Text color="muted.500" flexWrap={'wrap'}>
                Defaults to 'spr.local'. Set the name without the .local part or
                leave empty to use hostname
              </Text>
            </VStack>
            <Input
              flex={1}
              value={config.MDNSName}
              onChangeText={onChangeText}
              placeholder="spr"
            />
          </Stack>
        </Box>
        <Button rounded="none" colorScheme="primary" onPress={submitSettings}>
          Save Multicast settings
        </Button>
      </VStack>
    </>
  )
}

export default MDNSAdvertise
