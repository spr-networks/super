import React, { useEffect, useRef, useState } from 'react'
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

const UpstreamServicesList = (props) => {
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
    firewallAPI.addServicePort(service_port).then(result => {

    }).catch(err => {
      this.props.alertContext.errorResponse("Firewall API: ", '', err)
    })
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md">Allowed SPR Services</Heading>
          <Text color="muted.500" isTruncated>
          </Text>
        </VStack>
        <ModalForm
          title="Add Port"
          triggerText="Add Port"
          modalRef={refModal}
        >
          <AddServicePort notifyChange={notifyChange} />
        </ModalForm>
      </HStack>
      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        _rounded={{ md: 'md' }}
        width="100%"
        p={4}
        mb={4}
      >

      <HStack
        space={4}
        justifyContent="space-between"
        alignItems="center"
      >
        <Heading fontSize="sm">Protocol</Heading>
        <Heading fontSize="sm">Port</Heading>
        <Heading fontSize="sm">Enabled From Upstream WAN</Heading>
        <Heading fontSize="sm"></Heading>
      </HStack>

        <FlatList
          data={list}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth="1"
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py="2"
            >
              <HStack
                space={3}
                justifyContent="space-between"
                alignItems="center"
              >
                <Badge variant="outline">{item.Protocol}</Badge>
                <Text>{item.Port}</Text>
                <Box w="100" alignItems="center" alignSelf="center">
                  <Switch
                    defaultIsChecked={item.UpstreamEnabled}
                    onValueChange={() => toggleUpstream(item, !item.UpstreamEnabled)}
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
            </Box>
          )}
          keyExtractor={(item) =>
            `${item.Protocol}${item.DstIP}:${item.DstPort}`
          }
        />
      </Box>
    </>
  )
}

export default UpstreamServicesList
