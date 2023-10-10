import React, { useContext, useEffect, useRef, useState } from 'react'

import { AlertContext } from 'AppContext'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faArrowRightLong,
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddServicePort from './AddServicePort'

import {
  Badge,
  Button,
  Box,
  FlatList,
  Heading,
  HStack,
  IconButton,
  Stack,
  Switch,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

const UpstreamServicesList = (props) => {
  const context = useContext(AlertContext)

  const [list, setList] = useState([])

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      //setList(config.ForwardingRules)
      let flist = config.ServicePorts
      setList(flist)
    })
  }

  const deleteListItem = (item) => {
    firewallAPI.deleteServicePort(item).then((res) => {
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

  const toggleUpstream = (service_port, value) => {
    service_port.UpstreamEnabled = value
    firewallAPI
      .addServicePort(service_port)
      .then((result) => {})
      .catch((err) => {
        context.error('Firewall API: ' + err)
      })
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center">
        <VStack maxW="60%" p={4}>
          <Heading fontSize="md">Allowed SPR Services</Heading>
          <Text color="muted.500" isTruncated>
            Ports to allow from upstream
          </Text>
        </VStack>
        <ModalForm
          title="Add Port"
          triggerText="Add Port"
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddServicePort notifyChange={notifyChange} />
        </ModalForm>
      </HStack>
      <Box>
        <HStack
          space={4}
          justifyContent="space-between"
          alignItems="center"
          mb={4}
          px={4}
        >
          <Heading fontSize="sm">Protocol</Heading>
          <Heading fontSize="sm">Port</Heading>
          <Heading fontSize="sm">Enabled From Upstream WAN</Heading>
          <Heading fontSize="sm"></Heading>
        </HStack>

        <FlatList
          data={list}
          renderItem={({ item }) => (
            <HStack
              space={4}
              justifyContent="space-between"
              alignItems="center"
              bg="backgroundCardLight"
              borderBottomWidth={1}
              borderColor="borderColorCardLight"
              _dark={{
                bg: 'backgroundCardDark',
                borderColor: 'borderColorCardDark'
              }}
              p={4}
            >
              <Badge variant="outline">{item.Protocol}</Badge>
              <Text w={20}>{item.Port}</Text>
              <Box w={100} alignItems="center" alignSelf="center">
                <Switch
                  defaultIsChecked={item.UpstreamEnabled}
                  onValueChange={() =>
                    toggleUpstream(item, !item.UpstreamEnabled)
                  }
                />
              </Box>
              <IconButton
                alignSelf="center"
                size="sm"
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon icon={faXmark} />}
                onPress={() => deleteListItem(item)}
              />
            </HStack>
          )}
          keyExtractor={(item) =>
            `${item.Protocol}${item.Port}:${item.UpstreamEnabled}`
          }
        />

        <VStack>
          {!list.length ? (
            <Text px={{ base: 4, md: 0 }} flexWrap="wrap">
              No upstream services added
            </Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme={useColorModeValue('primary', 'muted')}
            rounded="none"
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={() => refModal.current()}
            mt={0}
          >
            Add Service Port
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default UpstreamServicesList
