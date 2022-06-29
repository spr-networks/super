import React, { useState, useEffect, useRef } from 'react'
import { Icon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { wireguardAPI, deviceAPI, pfwAPI } from 'api'
import WireguardAddSite from 'components/Wireguard/WireguardAddSite'
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
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

const SiteVPN = (props) => {
  const [sites, setSites] = useState(null)
  const [config, setConfig] = useState({})

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
    <View>
      <ScrollView mt={4}>
        <HStack justifyContent="space-between" space={1} alignItems="center">
          <Heading fontSize="md" alignSelf="center">
            Site-To-Site VPNs
          </Heading>

          <Box alignSelf="center">
            <ModalForm
              title="Add Site VPN"
              triggerText="Add Site"
              triggerClass="pull-right"
              modalRef={refModal}
            >
              <WireguardAddSite notifyChange={refreshSites} />
            </ModalForm>
          </Box>
        </HStack>
        <Box
          bg={useColorModeValue('warmGray.50', 'blueGray.800')}
          rounded="md"
          width="100%"
          p={4}
          my={4}
        >
          {sites !== null && sites.length ? (
            <FlatList
              data={sites}
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
                    space={2}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text flex="1" bold>
                      {item.Interface}
                    </Text>
                    <Text flex="1">{item.Address}</Text>
                    <Text flex="1">{item.Endpoint}</Text>
                    <Text
                      display={{ base: 'none', lg: 'flex' }}
                      fontSize="xs"
                      isTruncated
                    >
                      {item.PeerPublicKey}
                    </Text>
                    <Text
                      display={{ base: 'none', lg: 'flex' }}
                      fontSize="xs"
                      isTruncated
                    >
                      {item.PublicKey}
                    </Text>

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
              keyExtractor={(item, index) => `${item.Name}${index}`}
            />
          ) : null}

          <VStack>
            {sites !== null && sites.length === 0 ? (
              <Text alignSelf="center">
                There are no site VPNs configured yet
              </Text>
            ) : null}

            <Button
              display={{
                base: 'flex',
                md: 'flex'
              }}
              variant={useColorModeValue('subtle', 'solid')}
              colorScheme={useColorModeValue('muted', 'muted')}
              leftIcon={<Icon icon={faCirclePlus} />}
              onPress={triggerModal}
              mt={4}
            >
              Add a Site
            </Button>
          </VStack>
        </Box>
      </ScrollView>
    </View>
  )
}

export default SiteVPN
