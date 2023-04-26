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
import AddForward from './AddForward'

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

const ForwardList = (props) => {
  const [list, setList] = useState([])

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      //setList(config.ForwardingRules)
      let flist = config.ForwardingRules
      deviceAPI
        .list()
        .then((devices) => {
          flist = flist.map((rule) => {
            let deviceDst = Object.values(devices)
              .filter((d) => d.RecentIP == rule.DstIP)
              .pop()

            if (deviceDst) {
              rule.deviceDst = deviceDst
            }

            return rule
          })

          setList(flist)
        })
        .catch((err) => {
          //context.error('deviceAPI.list Error: ' + err)
          setList(flist)
        })
    })
  }

  const deleteListItem = (item) => {
    firewallAPI.deleteForward(item).then((res) => {
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
          <Heading fontSize="md">Port Forwarding</Heading>
          <Text color="muted.500" isTruncated>
            Set rules for DNAT forwarding of incoming traffic
          </Text>
        </VStack>
        <ModalForm
          title="Add Port Forwarding Rule"
          triggerText="Add Forward"
          modalRef={refModal}
        >
          <AddForward notifyChange={notifyChange} />
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
                <Badge variant="outline">{item.Protocol}</Badge>

                <HStack space={1}>
                  <Text bold>
                    {item.deviceSrc ? item.deviceSrc.Name : item.SrcIP}
                  </Text>
                  <Text color="muted.500">:</Text>
                  <Text>{item.SrcPort}</Text>
                </HStack>

                <Icon color="muted.400" icon={faArrowRightLong} />

                <HStack space={1}>
                  <Text bold>
                    {item.deviceDst &&
                    item.deviceDst.Name &&
                    item.deviceDst.Name.length > 0
                      ? item.deviceDst.Name
                      : item.DstIP}
                  </Text>
                  <Text color="muted.500">:</Text>
                  <Text>{item.DstPort}</Text>
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
            `${item.Protocol}${item.DstIP}:${item.DstPort}`
          }
        />

        <VStack>
          {!list.length ? (
            <Text alignSelf={'center'}>
              There are no forward rules configured yet
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
            Add Forward
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default ForwardList
