import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import { AppContext, alertState } from 'AppContext'

import { firewallAPI, deviceAPI } from 'api'
import { Multicast } from 'api/Multicast'

import ModalForm from 'components/ModalForm'
import AddMulticastPort from './AddMulticastPort'

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
  Text,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

const MulticastPorts = (props) => {
  const [list, setList] = useState([])
  const [ports, setPorts] = useState([])

  const contextType = useContext(AppContext)

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      if (config.MulticastPorts) {
        Multicast.config().then((mcast) => {
          setList(mcast.Addresses)
          setPorts(config.MulticastPorts)
        })
      }
    })
    .catch((err) => {
      alertState.error("Failed to retrieve multicast settings")
    })
}

  const deleteListItem = (item) => {

    const matches = (obj, target) => {
      for (let [key, val] of Object.entries(target)) {
        if (obj[key] !== val) return false;
      }
      return true;
    };
    let newList = list.filter(entry => !matches(entry,item))
    setList(newList)
    let inUse = {}
    for (let entry of newList) {
      let port = entry.Address.split(":")[1]
      inUse[port] = 1
    }
    let item_port = item.Address.split(":")[1]

    Multicast.config().then((mcast) => {
      mcast.Addresses = newList
      Multicast.setConfig(mcast).then(() => {
        //now update the firewall rule if nothing else uses that port
        if (!inUse[item_port]) {
          firewallAPI
          .deleteMulticastPort({Port: item_port, Upstream: false})
          .then(() => {
          })
          .catch((err) => {
            alertState.error("Fireall API failed to delete multicast port " + item_port)
          })
        }

      })
      .catch((err) => {
        alertState.error("Failed to update multicast settings")
      })
    })
    .catch((err) => {
      alertState.error("Failed to retrieve multicast settings")
    })
  }

  useEffect(() => {
    refreshList()
  }, [])

  let refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW={{ base: 'full', md: '60%' }}>
          <Heading fontSize="md">Multicast Proxy</Heading>
          <Text color="muted.500" isTruncated>
            Set ip:port addresses to proxy
          </Text>
        </VStack>
        <ModalForm
          title="Add Multicast Service Rule"
          triggerText="Add Multicast Service"
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddMulticastPort notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <Box px={4} mb={4}>
        <FlatList
          data={list}
          renderItem={({ item }) => (
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
              <HStack
                space={3}
                justifyContent="space-between"
                alignItems="center"
              >
                <HStack space={1}>
                  <Text>{item.Address}</Text>
                </HStack>

                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon icon={faXmark} />}
                  onPress={() => deleteListItem(item)}
                />
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => `${item.Address}`}
        />

        <VStack>
          {!list.length ? (
            <Text alignSelf={'center'}>
              There are no multicast proxy rules configured yet
            </Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme={useColorModeValue('primary', 'muted')}
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={() => refModal.current()}
            mt={4}
          >
            Add Multicast Service
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default MulticastPorts
