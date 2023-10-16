import React, { useState, useEffect, useRef } from 'react'

import { pfwAPI } from 'api'
import WireguardAddSite from 'components/Wireguard/WireguardAddSite'
import ModalForm from 'components/ModalForm'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Text,
  VStack,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

const SiteVPN = (props) => {
  const [sites, setSites] = useState(null)

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

      setSites(s)
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
          <WireguardAddSite notifyChange={refreshSites} />
        </ModalForm>
      </ListHeader>

      {sites !== null && sites.length ? (
        <FlatList
          data={sites}
          renderItem={({ item }) => (
            <ListItem>
              <Text flex="1" bold>
                {item.Interface}
              </Text>
              <Text flex="1">{item.Address}</Text>
              <Text flex="1">{item.Endpoint}</Text>
              <Text
                sx={{
                  '@base': { display: 'none' },
                  '@md': { display: 'flex' }
                }}
                fontSize="xs"
                isTruncated
              >
                {item.PeerPublicKey}
              </Text>
              <Text
                sx={{
                  '@base': { display: 'none' },
                  '@md': { display: 'flex' }
                }}
                fontSize="xs"
                isTruncated
              >
                {item.PublicKey}
              </Text>

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
