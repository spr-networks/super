import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faTags,
  faPlus,
  faToggleOn,
  faToggleOff,
  faTrash,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { AppContext, alertState } from 'AppContext'

import { firewallAPI, deviceAPI } from 'api'
import { Multicast } from 'api/Multicast'

import ModalForm from 'components/ModalForm'
import ModalConfirm from 'components/ModalConfirm'
import AddMulticastPort from './AddMulticastPort'

import {
  Badge,
  Button,
  Box,
  FlatList,
  Heading,
  IconButton,
  Menu,
  Stack,
  HStack,
  VStack,
  Text,
  Tooltip,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

const MulticastPorts = (props) => {
  const [list, setList] = useState([])
  const [ports, setPorts] = useState([])

  const [state, setState] = useState({
    pending: false,
    showModal: false,
    modalType: '',
    pendingItem: {},
  })

  const contextType = useContext(AppContext)

  const matches = (obj, target) => {
    for (let [key, val] of Object.entries(target)) {
      if (obj[key] !== val) return false
    }
    return true
  }

  const refreshList = () => {
    firewallAPI
      .config()
      .then((config) => {
        if (config.MulticastPorts) {
          Multicast.config().then((mcast) => {
            setList(mcast.Addresses)
            setPorts(config.MulticastPorts)
          })
        }
      })
      .catch((err) => {
        alertState.error('Failed to retrieve multicast settings')
      })
  }

  const deleteListItem = (item) => {
    let newList = list.filter((entry) => !matches(entry, item))
    setList(newList)
    let inUse = {}
    for (let entry of newList) {
      let port = entry.Address.split(':')[1]
      inUse[port] = 1
    }
    let item_port = item.Address.split(':')[1]

    Multicast.config()
      .then((mcast) => {
        mcast.Addresses = newList
        Multicast.setConfig(mcast)
          .then(() => {
            //now update the firewall rule if nothing else uses that port
            if (!inUse[item_port]) {
              firewallAPI
                .deleteMulticastPort({ Port: item_port, Upstream: false })
                .then(() => {})
                .catch((err) => {
                  alertState.error(
                    'Fireall API failed to delete multicast port ' + item_port
                  )
                })
            }
          })
          .catch((err) => {
            alertState.error('Failed to update multicast settings')
          })
      })
      .catch((err) => {
        alertState.error('Failed to retrieve multicast settings')
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

  const handleTags = (item, tags) => {
    if (tags.length == 1 && tags[0] == null) {
      return
    }

    //alert(JSON.stringify(item.Tags) + " vs " + JSON.stringify(tags))

    if (tags != null) {
      tags = tags.filter((v) => typeof v === 'string')
      tags = [...new Set(tags)]
    }

    const newList = list.map(entry => {
      if (entry.Address === item.Address) {
        return {...item, Tags: tags};
      }
      return entry;
    });

    setList(newList);

    Multicast.config()
      .then((mcast) => {
        mcast.Addresses = newList
        Multicast.setConfig(mcast)
          .then(() => {
            alertState.success("Updated tags")
            refreshList()
          }
        )
        .catch((error) => {
          alertState.error('API Failure: ' + error.message)
        })
      }
    )
    .catch((error) => {
      alertState.error('API Failure: ' + error.message)
    })

  }

  const handleSubmitNew = (item, value) => {
    //this runs when someone hits Okay
    if (!item) {
      return //workaround for react state glitch
    }

    let tags = []
    if (item.Tags) {
      tags = item.Tags.concat(value)
    } else {
      tags = [value]
    }
    handleTags(item, tags)
  }

  let trigger = (triggerProps) => {
    return (
      <Tooltip
        label={
          'Set a tag to whitelist client interfaces that will receive this multicast service. NOTE: wired downlinks not isolated without VLANs'
        }
      >
        <IconButton
          display={{ base: 'flex' }}
          variant="unstyled"
          icon={<Icon icon={faTags} color="muted.600" />}
          {...triggerProps}
        />
      </Tooltip>
    )
  }

  const defaultTags = []

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW={{ base: 'full', md: '60%' }}>
          <Heading fontSize="md">Multicast Proxy</Heading>
          <Text color="muted.500" isTruncated>
            Set ip:port addresses to proxy
          </Text>
        </VStack>
        <ModalForm
          title="Add Multicast Service Rule"
          triggerText="Add Multicast Service"
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddMulticastPort notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

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
              space={4}
              justifyContent="space-between"
              alignItems="left"
            >
              <HStack space={1}>
                <Text>{item.Address}</Text>
              </HStack>

              <HStack>
              {item.Tags
                ? item.Tags.map((entry) => (
                    <Badge key={item.URI + entry} variant="outline">
                      {entry}
                    </Badge>
                  ))
                : null}
              </HStack>

              <IconButton
                alignSelf="center"
                size="sm"
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon icon={faXmark} />}
                onPress={() => deleteListItem(item)}
              />

              <Menu trigger={trigger}>
                <Menu.OptionGroup
                  title="Tags"
                  type="checkbox"
                  defaultValue={item.Tags ? item.Tags : []}
                  onChange={(value) => handleTags(item, value)}
                >
                  {[
                    ...new Set(
                      defaultTags.concat(item.Tags ? item.Tags : [])
                    )
                  ].map((tag) => (
                    <Menu.ItemOption key={tag} value={tag}>
                      {tag} x
                    </Menu.ItemOption>
                  ))}
                  <Menu.ItemOption
                    key="newTag"
                    onPress={() => {
                      setState({
                        showModal: true,
                        modalType: 'Tag',
                        pendingItem: item
                      })
                    }}
                  >
                    New Tag...
                  </Menu.ItemOption>
                </Menu.OptionGroup>
              </Menu>

            </HStack>
          </Box>
        )}
        keyExtractor={(item) => `${item.Address}`}
      />

      <VStack>
        {!list.length ? (
          <Text px={{ base: 4, md: 0 }} mb={4} flexWrap="wrap">
            There are no multicast proxy rules configured yet
          </Text>
        ) : null}
        <Button
          display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
          variant={useColorModeValue('subtle', 'solid')}
          colorScheme={useColorModeValue('primary', 'muted')}
          leftIcon={<Icon icon={faCirclePlus} />}
          onPress={() => refModal.current()}
        >
          Add Multicast Service
        </Button>

        <ModalConfirm
          type={state.modalType}
          onSubmit={(v) => handleSubmitNew(state.pendingItem, v)}
          onClose={() => setState({ showModal: false })}
          isOpen={state.showModal}
        />
      </VStack>

    </>
  )
}

export default MulticastPorts
