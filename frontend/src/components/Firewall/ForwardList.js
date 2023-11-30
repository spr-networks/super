import React, { useEffect, useRef, useState } from 'react'

import { firewallAPI, deviceAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddForward from './AddForward'

import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  ButtonIcon,
  Box,
  FlatList,
  HStack,
  VStack,
  Text,
  AddIcon,
  ArrowRightIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import ListHeader from 'components/List/ListHeader'
import { ListItem } from 'components/List'

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
    <VStack>
      <ListHeader
        title="Port Forwarding"
        description="Set rules to forward of incoming traffic"
      >
        <ModalForm
          title="Add Port Forwarding Rule"
          triggerText="Add Forward"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddForward notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <Badge action="muted" variant="outline">
              <BadgeText>{item.Protocol}</BadgeText>
            </Badge>

            <HStack flex={1} space={1} justifyContent="flex-end">
              <Text bold>
                {item.deviceSrc ? item.deviceSrc.Name : item.SrcIP}
              </Text>
              <Text color="$muted500">:</Text>
              <Text>{item.SrcPort}</Text>
            </HStack>

            <ArrowRightIcon color="$muted500" />

            <HStack flex={1} space={1}>
              <Text bold>
                {item.deviceDst &&
                item.deviceDst.Name &&
                item.deviceDst.Name.length > 0
                  ? item.deviceDst.Name
                  : item.DstIP}
              </Text>
              <Text color="$muted500">:</Text>
              <Text>{item.DstPort}</Text>
            </HStack>

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
        keyExtractor={(item) => `${item.Protocol}${item.DstIP}:${item.DstPort}`}
      />

      {!list.length ? (
        <Text
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          p="$4"
          flexWrap="wrap"
        >
          Forward incoming WAN packets to access a service that runs on the LAN.
        </Text>
      ) : null}

      <Button
        sx={{ '@md': { display: list.length ? 'none' : 'none' } }}
        action="primary"
        variant="solid"
        rounded="$none"
        onPress={() => refModal.current()}
      >
        <ButtonText>Add Forward</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

export default ForwardList
