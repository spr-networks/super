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
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Box,
  FlatList,
  Heading,
  HStack,
  Switch,
  VStack,
  Text,
  AddIcon,
  RemoveIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

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
      .then((result) => {
        refreshList()
      })
      .catch((err) => {
        context.error('Firewall API: ' + err)
      })
  }

  return (
    <>
      <ListHeader
        title="Allowed SPR Services"
        description="Ports to allow from upstream"
      >
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
      </ListHeader>

      <Box>
        <HStack
          space="md"
          justifyContent="space-between"
          alignItems="center"
          mb="$4"
          px="$4"
        >
          <Heading size="xs">Protocol</Heading>
          <Heading size="xs">Port</Heading>
          <Heading size="xs">Enabled From Upstream WAN</Heading>
          <Heading size="xs"></Heading>
        </HStack>

        <FlatList
          data={list}
          renderItem={({ item }) => (
            <ListItem key={`upstream:${JSON.stringify(item)}`}>
              <Badge action="muted" variant="outline">
                <BadgeText>{item.Protocol}</BadgeText>
              </Badge>
              <Text w={100}>{item.Port}</Text>
              <Box w={100} alignItems="center" alignSelf="center">
                <Switch
                  value={item.UpstreamEnabled}
                  onToggle={() => toggleUpstream(item, !item.UpstreamEnabled)}
                />
              </Box>
              <Button
                alignSelf="center"
                size="sm"
                action="negative"
                variant="link"
                onPress={() => deleteListItem(item)}
              >
                <ButtonIcon as={CloseIcon} color="$red700" />
              </Button>
            </ListItem>
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
            sx={{ '@md': { display: list.length ? 'none' : 'flex' } }}
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={() => refModal.current()}
            mt={0}
          >
            <ButtonText>Add Service Port</ButtonText>
            <ButtonIcon as={AddIcon} />
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default UpstreamServicesList
