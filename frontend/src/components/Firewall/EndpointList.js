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
import AddEndpoint from './AddEndpoint'

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

const EndpointList = (props) => {
  const [list, setList] = useState([])

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      let flist = config.Endpoints
      if (flist != null) {
        setList(flist)
      }
    })
  }

  const deleteListItem = (item) => {
    firewallAPI.deleteEndpoint(item).then((res) => {
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
          <Heading fontSize="md">Endpoints</Heading>
          <Text color="muted.500" isTruncated>
            Describe Service Endpoints for building Firewall Rules
          </Text>
        </VStack>
        <ModalForm
          title="Add Service Endpoint"
          triggerText="Add Service Endpoint"
          modalRef={refModal}
        >
          <AddEndpoint notifyChange={notifyChange} />
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
                  <Text bold>
                    {item.RuleName}
                  </Text>
                </HStack>

                <Icon color="muted.400" icon={faArrowRightLong} />

                <Badge variant="outline">{item.Protocol}</Badge>

                <HStack space={1}>
                  <Text bold>
                    {item.Domain}
                    {item.IP}
                  </Text>
                  <Text color="muted.500">:</Text>
                  <Text>{item.Port}</Text>
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
          keyExtractor={(item) =>
            `${item.Protocol}${item.iP}:${item.Port}`
          }
        />

        <VStack>
          {!list.length ? (
            <Text alignSelf={'center'}>
              There are no endpoints defined yet
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
            Add Endpoint
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default EndpointList
