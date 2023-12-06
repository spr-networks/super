import React, { useState, useEffect, useRef } from 'react'

import { wireguardAPI, deviceAPI } from 'api'
import WireguardAddPeer from 'components/Wireguard/WireguardAddPeer'
import ModalForm from 'components/ModalForm'
import { prettyDate, prettySize } from 'utils'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Icon,
  Text,
  VStack,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ArrowUpCircleIcon, ArrowDownCircleIcon } from 'lucide-react-native'

import { ListHeader, ListItem } from 'components/List'

const PeerList = (props) => {
  const [peers, setPeers] = useState(null)
  const [config, setConfig] = useState({})

  const refreshPeers = () => {
    wireguardAPI
      .status()
      .then((status) => {
        if (!status || !Object.keys(status).length) {
          return
        }

        let publicKey = status.wg0.publicKey,
          listenPort = status.wg0.listenPort

        setConfig({ publicKey, listenPort })
      })
      .catch((err) => {})

    wireguardAPI
      .peers()
      .then((list) => {
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
      .catch((err) => {})
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
    <>
      <ListHeader title="Peers">
        <ModalForm
          title="Add Wireguard peer"
          triggerText="Add Peer"
          triggerClass="pull-right"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: peers?.length ? 'flex' : 'none' }
            }
          }}
          modalRef={refModal}
        >
          <WireguardAddPeer
            config={config}
            notifyChange={refreshPeers}
            defaultEndpoints={props.defaultEndpoints}
          />
        </ModalForm>
      </ListHeader>

      {peers !== null && peers.length ? (
        <FlatList
          data={peers}
          renderItem={({ item }) => (
            <ListItem>
              <Text size="sm" bold>
                {item.device ? item.device.Name : `peer`}
              </Text>

              <VStack
                flex={2}
                sx={{ '@md': { flexDirection: 'row', gap: '16px' } }}
                alignItems="flex-end"
              >
                <Text size="sm">{item.AllowedIPs.trim()}</Text>

                {item.LatestHandshake ? (
                  <Text flex={1}>
                    {prettyDate(new Date(item.LatestHandshake * 1e3))}
                  </Text>
                ) : null}

                {item.TransferRx ? (
                  <HStack flex={1} space="sm">
                    <HStack space="xs" alignItems="center">
                      <Icon as={ArrowUpCircleIcon} color="$muted500" />
                      <Text size="xs">{prettySize(item.TransferTx)}</Text>
                    </HStack>
                    <HStack space="xs" alignItems="center">
                      <Icon as={ArrowDownCircleIcon} color="$muted500" />
                      <Text size="xs">{prettySize(item.TransferRx)}</Text>
                    </HStack>
                  </HStack>
                ) : null}
              </VStack>
              <Button
                size="sm"
                variant="link"
                onPress={() => deleteListItem(item)}
              >
                <ButtonIcon as={CloseIcon} color="$red700" />
              </Button>
            </ListItem>
          )}
          keyExtractor={(item, index) => `${item.Name}${index}`}
        />
      ) : null}

      <VStack>
        {peers !== null && peers.length === 0 ? (
          <>
            {config.listenPort ? (
              <Text px="$4" mb="$4" flexWrap="wrap">
                There are no peers configured yet
              </Text>
            ) : (
              <Text px="$4" mb="$4" flexWrap="wrap">
                Wireguard is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </>
        ) : null}

        <Button
          sx={{
            '@md': {
              display: peers !== null && peers.length === 0 ? 'flex' : 'none'
            }
          }}
          action="primary"
          variant="solid"
          rounded="$none"
          onPress={triggerModal}
        >
          <ButtonText>Add Peer</ButtonText>
          <ButtonIcon as={AddIcon} />
        </Button>
      </VStack>
    </>
  )
}

export default PeerList
