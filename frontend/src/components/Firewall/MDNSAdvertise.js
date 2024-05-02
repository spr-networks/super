import React, { useState, useEffect } from 'react'

import { alertState } from 'AppContext'

import { firewallAPI } from 'api'
import { Multicast } from 'api/Multicast'

import {
  Button,
  ButtonText,
  Input,
  InputField,
  VStack,
  Switch,
  Text,
  HStack,
  ButtonIcon,
  CheckIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

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

  const submitSettings = () => {
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
    Multicast.config().then((x) => {
      setConfig(x)
    })
  }, [])

  return (
    <>
      <ListHeader
        title="Multicast Settings"
        description="Configure Multicast Proxy"
      ></ListHeader>

      <VStack>
        <ListItem>
          <Text bold>Enable Multicast Proxy</Text>
          <Switch value={!config.Disabled} onToggle={toggleMulticast} />
        </ListItem>

        <ListItem>
          <Text bold>Advertise Router over mDNS</Text>
          <Switch value={!config.DisableMDNSAdvertise} onToggle={toggleMDNS} />
        </ListItem>

        { !config.DisableMDNSAdvertise &&
        <VStack
          space="md"
          bg="$backgroundCardLight"
          p="$4"
          sx={{
            _dark: {
              bg: '$backgroundCardDark'
            }
          }}
        >
          <VStack
            space="md"
            sx={{
              '@md': { maxWidth: '$1/2' }
            }}
          >
            <Text bold>mDNS Name</Text>
            <Text size="sm" color="$muted500" flexWrap="wrap">
              Defaults to 'spr.local'. Set the name without the .local part or
              leave empty to use hostname
            </Text>
            <Input>
              <InputField value={config.MDNSName} type="text" onChange={(e) => onChangeText(e.target.value)} placeholder="spr" />
            </Input>

            <HStack>
              <Button onPress={submitSettings}>
                <ButtonText>Save Multicast settings</ButtonText>
                <ButtonIcon as={CheckIcon} ml="$1" />
              </Button>
            </HStack>
          </VStack>
        </VStack>
        }
      </VStack>
    </>
  )
}

export default MDNSAdvertise
