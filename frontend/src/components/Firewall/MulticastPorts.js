import React, { useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faArrowRightLong,
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI, deviceAPI } from 'api'
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

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      let flist = config.MulticastPorts
      if (config.MulticastPorts) {
        setList(flist)
      }
    })
  }

  const deleteListItem = (item) => {
    firewallAPI.deleteMulticastPort(item).then((res) => {
      refreshList()
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
        <VStack maxW="60%">
          <Heading fontSize="md">Multicast Services</Heading>
          <Text color="muted.500" isTruncated>
            Set services for Multicast Proxy
          </Text>
        </VStack>
        <ModalForm
          title="Add Multicast Service Rule"
          triggerText="Add Multicast"
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

                <Icon color="muted.400" icon={faArrowRightLong} />

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
          keyExtractor={(item) =>
            `${item.Address}`
          }
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
            colorScheme="muted"
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
