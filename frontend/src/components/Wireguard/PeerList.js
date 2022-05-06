import React, { useState, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faPlus,
  faArrowCircleDown,
  faArrowCircleUp,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { wireguardAPI, deviceAPI } from 'api'
import WireguardAddPeer from 'components/Wireguard/WireguardAddPeer'
import ModalForm from 'components/ModalForm'
import { prettyDate, prettySize } from 'utils'

import {
  View,
  Divider,
  Box,
  Button,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Spacer,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

const PeerList = (props) => {
  const [peers, setPeers] = useState(null)
  const [config, setConfig] = useState({})

  const refreshPeers = () => {
    wireguardAPI.status().then((status) => {
      let publicKey = status.wg0.publicKey,
        listenPort = status.wg0.listenPort

      setConfig({ publicKey, listenPort })
    })

    wireguardAPI.peers().then((list) => {
      deviceAPI
        .list()
        .then((devices) => {
          list = list.map((peer) => {
            let device = Object.values(devices)
              .filter((d) => d.WGPubKey == peer.PublicKey)
              .pop()

            if (device) {
              peer.device = device
            }

            return peer
          })

          setPeers(list)
        })
        .catch((err) => {
          setPeers(list)
        })
    })
  }

  useEffect(() => {
    refreshPeers()
  }, [])

  const deleteListItem = (peer) => {
    wireguardAPI
      .deletePeer(peer)
      .then(refreshPeers)
      .catch((err) => {})
  }

  const refModal = useRef(null)

  const triggerModal = () => {
    refModal.current()
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <HStack justifyContent="space-between">
        <Heading fontSize="xl" pb="3" alignSelf="center">
          Peers
        </Heading>

        <Box alignSelf="center">
          <ModalForm
            title="Add Wireguard peer"
            triggerText="add"
            triggerClass="pull-right"
            triggerIcon={faPlus}
            modalRef={refModal}
          >
            <WireguardAddPeer config={config} notifyChange={refreshPeers} />
          </ModalForm>
        </Box>
      </HStack>

      {peers !== null && peers.length ? (
        <FlatList
          data={peers}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth="1"
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py="2"
            >
              <HStack space={2} justifyContent="space-between">
                <Text bold>{item.device ? item.device.Name : `peer`}</Text>
                <Text>{item.AllowedIPs}</Text>
                <Text display={{ base: 'none', lg: 'flex' }}>
                  {item.PublicKey}
                </Text>
                <Text>
                  {item.LatestHandshake
                    ? prettyDate(new Date(item.LatestHandshake * 1e3))
                    : null}
                </Text>
                <Text>
                  {item.TransferRx ? (
                    <HStack space={1}>
                      <HStack space={1}>
                        <Icon as={FontAwesomeIcon} icon={faArrowCircleUp} />
                        <Text>{prettySize(item.TransferTx)}</Text>
                      </HStack>
                      <HStack space={1}>
                        <Icon as={FontAwesomeIcon} icon={faArrowCircleDown} />
                        <Text>{prettySize(item.TransferRx)}</Text>
                      </HStack>
                    </HStack>
                  ) : null}
                </Text>

                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                  onPress={() => deleteListItem(item)}
                />
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.Name}
        />
      ) : null}
      {peers !== null && peers.length === 0 ? (
        <>
          {config.listenPort ? (
            <Text py="4">There are no peers configured yet</Text>
          ) : (
            <Text py="4">
              Wireguard is not running. See /configs/wireguard/wg0.conf
            </Text>
          )}

          <Button
            size="md"
            variant="outline"
            colorScheme="primary"
            rounded="full"
            borderColor="info.400"
            leftIcon={<Icon as={FontAwesomeIcon} icon={faPlus} />}
            onPress={triggerModal}
          >
            add a new peer
          </Button>
        </>
      ) : null}
    </Box>
  )
}

export default PeerList
