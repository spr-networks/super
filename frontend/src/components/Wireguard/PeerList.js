import React, { useState, useEffect, useRef } from 'react'
import { Icon } from 'FontAwesomeUtils'
import {
  faPlus,
  faArrowCircleDown,
  faArrowCircleUp,
  faXmark,
  faCirclePlus
} from '@fortawesome/free-solid-svg-icons'

import { wireguardAPI, deviceAPI } from 'api'
import WireguardAddPeer from 'components/Wireguard/WireguardAddPeer'
import ModalForm from 'components/ModalForm'
import { prettyDate, prettySize } from 'utils'

import {
  Box,
  Button,
  Fab,
  FlatList,
  Heading,
  IconButton,
  HStack,
  ScrollView,
  Stack,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

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
    <View>
      {/*<ScrollView h="calc(100vh - 260px)">*/}
      <ScrollView>
        <HStack justifyContent="space-between" p={4}>
          <Heading fontSize="md" alignSelf="center">
            Peers
          </Heading>

          <Box alignSelf="center">
            <ModalForm
              title="Add Wireguard peer"
              triggerText="Add Peer"
              triggerClass="pull-right"
              modalRef={refModal}
            >
              <WireguardAddPeer config={config} notifyChange={refreshPeers} />
            </ModalForm>
          </Box>
        </HStack>
        <Box
          bg={useColorModeValue('warmGray.50', 'blueGray.800')}
          _rounded={{ md: 'md' }}
          width="100%"
          p={4}
        >
          {peers !== null && peers.length ? (
            <FlatList
              data={peers}
              renderItem={({ item }) => (
                <HStack
                  space={2}
                  justifyContent="space-between"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor="muted.200"
                  _dark={{
                    borderColor: 'muted.600'
                  }}
                  py={2}
                >
                  <Stack
                    flex={1}
                    space={1}
                    direction={{ base: 'column', md: 'row' }}
                    justifyContent="space-between"
                  >
                    <Text flex="1" bold>
                      {item.device ? item.device.Name : `peer`}
                    </Text>
                    <Text flex="1">{item.AllowedIPs}</Text>
                    <Text
                      flex={2}
                      display={{ base: 'none', lg: 'flex' }}
                      fontSize="xs"
                      isTruncated
                    >
                      {item.PublicKey}
                    </Text>
                    <Text flex={1}>
                      {item.LatestHandshake
                        ? prettyDate(new Date(item.LatestHandshake * 1e3))
                        : null}
                    </Text>
                    <Text flex={1}>
                      {item.TransferRx ? (
                        <HStack space={1}>
                          <HStack space={1} alignItems={'center'}>
                            <Icon color="muted.500" icon={faArrowCircleUp} />
                            <Text fontSize="xs">
                              {prettySize(item.TransferTx)}
                            </Text>
                          </HStack>
                          <HStack space={1} alignItems={'center'}>
                            <Icon color="muted.500" icon={faArrowCircleDown} />
                            <Text fontSize="xs">
                              {prettySize(item.TransferRx)}
                            </Text>
                          </HStack>
                        </HStack>
                      ) : null}
                    </Text>
                  </Stack>

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
              keyExtractor={(item, index) => `${item.Name}${index}`}
            />
          ) : null}

          <VStack>
            {peers !== null && peers.length === 0 ? (
              <>
                {config.listenPort ? (
                  <Text alignSelf="center">
                    There are no peers configured yet
                  </Text>
                ) : (
                  <Text alignSelf="center">
                    Wireguard is not running. See /configs/wireguard/wg0.conf
                  </Text>
                )}
              </>
            ) : null}

            <Button
              display={{
                base: 'flex',
                md: peers !== null && peers.length === 0 ? 'flex' : 'none'
              }}
              variant={useColorModeValue('subtle', 'solid')}
              colorScheme={useColorModeValue('muted', 'muted')}
              leftIcon={<Icon icon={faCirclePlus} />}
              onPress={triggerModal}
              mt={4}
            >
              Add Peer
            </Button>
          </VStack>
        </Box>
      </ScrollView>
      {/*<Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        icon={<Icon color="white" icon={faPlus} />}
        onPress={triggerModal}
      />
      */}
    </View>
  )
}

export default PeerList
