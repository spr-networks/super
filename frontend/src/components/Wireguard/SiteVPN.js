import React, { useState, useContext, useEffect, useRef } from 'react'

import { api, pfwAPI, wireguardAPI } from 'api'
import WireguardAddSite from 'components/Wireguard/WireguardAddSite'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'AppContext'
import { prettyDate, prettySize } from 'utils'

import {
  AddIcon,
  AlertCircleIcon,
  Button,
  ButtonIcon,
  ButtonText,
  CheckCircleIcon,
  CloseIcon,
  FlatList,
  HStack,
  Icon,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { ArrowUpCircleIcon, ArrowDownCircleIcon } from 'lucide-react-native'

import { ListHeader, ListItem } from 'components/List'

const SiteVPN = (props) => {
  const [sites, setSites] = useState(null)
  const [siteStatus, setSiteStatus] = useState({})
  const context = useContext(AlertContext)

  const refreshSites = () => {
    pfwAPI.config().then((config) => {
      let s = []
      for (let i = 0; i < config.SiteVPNs.length; i++) {
        let extension = {
          Index: i,
          Interface: 'site' + i
        }
        let new_obj = { ...extension, ...config.SiteVPNs[i] }
        s.push(new_obj)
      }

      //wake up each site first
      const putPromises = s.map((site) => {
        return api.put(`/ping/${site.Interface}/127.0.0.1`).catch(() => {})
      })

      Promise.all(putPromises)
        .then(() => {
          //now get wireguard status
          wireguardAPI.status().then((status) => {
            let newStatus = {}
            for (let entry of s) {
              if (status[entry.Interface]) {
                newStatus[entry.Interface] = status[entry.Interface]
              }
            }
            setSiteStatus(newStatus)
            setSites(s)
            //alert(JSON.stringify(newStatus["site0"].peers[]))
          })
        })
        .catch((e) => {
          context.error('Failed to query pfw', e)
        })
    })
  }
  useEffect(() => {
    refreshSites()
  }, [])

  const deleteListItem = (site) => {
    pfwAPI
      .deleteSiteVPN(site.Index)
      .then(refreshSites)
      .catch((err) => {})
  }

  const refModal = useRef(null)

  const triggerModal = () => {
    refModal.current()
  }

  const getOnlineStatus = (item) => {
    let itemStatus = siteStatus[item.Interface]
    if (!itemStatus) {
      return null
    }
    let peer = Object.keys(itemStatus.peers)[0]
    if (!peer) {
      return null
    }
    peer = itemStatus.peers[peer]
    if (!peer) {
      return null
    }
    const isOnlineWithinLastHour =
      peer.latestHandshake &&
      Date.now() - peer.latestHandshake * 1e3 < 60 * 60 * 1000

    return (
      <HStack>
        <HStack space="xs" alignItems="center">
          {isOnlineWithinLastHour ? (
            <>
              <Icon as={CheckCircleIcon} color="$success600" size="sm" />
              <Text size="sm">Online</Text>
            </>
          ) : (
            <>
              <Icon as={AlertCircleIcon} color="$error600" size="sm" />
              <Text size="sm">Offline</Text>
            </>
          )}
        </HStack>

        {peer.transferRx ? (
          <HStack flex={1} space="sm">
            <HStack space="xs" alignItems="center">
              <Icon as={ArrowUpCircleIcon} color="$muted500" />
              <Text size="xs">{prettySize(peer.transferTx)}</Text>
            </HStack>
            <HStack space="xs" alignItems="center">
              <Icon as={ArrowDownCircleIcon} color="$muted500" />
              <Text size="xs">{prettySize(peer.transferRx)}</Text>
            </HStack>
          </HStack>
        ) : null}
      </HStack>
    )
  }

  const notifyChange = (action) => {
    refModal.current()
    refreshSites()
  }

  return (
    <>
      <ListHeader title="Site-To-Site VPNs">
        <ModalForm
          title="Add Site VPN"
          triggerText="Add Site"
          triggerClass="pull-right"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: sites?.length ? 'flex' : 'none' }
            }
          }}
          modalRef={refModal}
        >
          <WireguardAddSite notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>
      {sites !== null && sites.length ? (
        <FlatList
          data={sites}
          renderItem={({ item }) => (
            <ListItem>
              <Text flex={1} bold>
                {item.Interface}
              </Text>

              {getOnlineStatus(item)}

              <VStack space="sm" flex={2}>
                <Text>{item.Address}</Text>
                <Text>{item.Endpoint}</Text>
              </VStack>
              <VStack space="sm">
                <Text
                  sx={{
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }}
                  size="xs"
                  isTruncated
                >
                  {item.PeerPublicKey}
                </Text>
                <Text
                  sx={{
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }}
                  size="xs"
                  isTruncated
                >
                  {item.PublicKey}
                </Text>
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
        {sites !== null && sites.length === 0 ? (
          <Text px="$4" mb="$4" flexWrap="wrap">
            There are no site VPNs configured yet
          </Text>
        ) : null}

        <Button
          sx={{
            '@md': {
              display: sites?.length === 0 ? 'flex' : 'none'
            }
          }}
          action="primary"
          variant="solid"
          rounded="$none"
          onPress={triggerModal}
        >
          <ButtonText>Add a Site</ButtonText>
          <ButtonIcon as={AddIcon} />
        </Button>
      </VStack>
    </>
  )
}

export default SiteVPN
