import { useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faArrowRightLong,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI, deviceAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddForward from './AddForward'

import {
  Badge,
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
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
      mb="4"
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="xl">Incoming Traffic Forwarding</Heading>
          <Text color="muted.500">Set rules for DNAT forwarding of incoming traffic</Text>
        </VStack>
        <ModalForm
          title="Add Rewrite/Forwarding Rule"
          triggerText="Add Forward"
          triggerIcon={faPlus}
          modalRef={refModal}
        >
          <AddForward notifyChange={notifyChange} />
        </ModalForm>
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
                  {item.deviceDst ? item.deviceDst.Name : item.DstIP}
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
        keyExtractor={(item) => `${item.Protocol}${item.DstIP}:${item.DstPort}`}
      />

      {!list.length ? (
        <Text>There are no forward rules configured yet</Text>
      ) : null}
    </Box>
  )
}

export default ForwardList
