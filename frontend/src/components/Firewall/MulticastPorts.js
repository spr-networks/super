import React, { useContext, useEffect, useRef, useState } from 'react'

import { AppContext, alertState } from 'AppContext'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Icon,
  HStack,
  VStack,
  Text,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { AlertContext } from 'layouts/Admin'
import { Tooltip } from 'components/Tooltip'
import { TagIcon } from 'lucide-react-native'

import { firewallAPI } from 'api'
import { Multicast } from 'api/Multicast'

import ModalForm from 'components/ModalForm'
import AddMulticastPort from './AddMulticastPort'

import { ListHeader, ListItem } from 'components/List'
import { TagItem } from 'components/TagItem'
import { TagMenu } from 'components/TagMenu'

const MulticastPorts = (props) => {
  const [list, setList] = useState([])
  const [ports, setPorts] = useState([])

  const context = useContext(AlertContext)

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
                  context.error(
                    'Firewall API failed to delete multicast port ' + item_port
                  )
                })
            }
          })
          .catch((err) => {
            context.error('Failed to update multicast settings')
          })
      })
      .catch((err) => {
        context.error('Failed to retrieve multicast settings')
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

    tags = tags ? [...new Set(tags)] : []

    const newList = list.map((entry) => {
      if (entry.Address === item.Address) {
        return { ...item, Tags: tags }
      }
      return entry
    })

    setList(newList)

    Multicast.config()
      .then((mcast) => {
        mcast.Addresses = newList
        Multicast.setConfig(mcast)
          .then(() => {
            alertState.success('Updated tags')
            refreshList()
          })
          .catch((error) => {
            alertState.error('API Failure: ' + error.message)
          })
      })
      .catch((error) => {
        alertState.error('API Failure: ' + error.message)
      })
  }

  let trigger = (triggerProps) => {
    /*<Tooltip
        label={
          'Set a tag to whitelist client interfaces that will receive this multicast service. NOTE: wired downlinks not isolated without VLANs'
        }
      ></Tooltip>*/
    return (
      <Tooltip label="Set a tag here and on the target devices, to whitelist interfaces that will receive this multicast service. NOTE: wired downlinks not isolated without VLANs">
        <Button variant="link" {...triggerProps}>
          <Icon as={TagIcon} color="$muted600" />
        </Button>
      </Tooltip>
    )
  }

  const defaultTags = []

  return (
    <VStack>
      <ListHeader
        title="Multicast Proxy"
        description="Set ip:port addresses to proxy"
      >
        <ModalForm
          title="Add Multicast Service Rule"
          triggerText="Add Multicast Service"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddMulticastPort notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <Text flex={1}>{item.Address}</Text>

            <HStack space="sm">
              {item.Tags?.map((entry) => (
                <TagItem name={entry} />
              ))}
            </HStack>

            <HStack ml="auto" space="xl">
              <TagMenu
                items={[...new Set(defaultTags.concat(item?.Tags || []))]}
                selectedKeys={item?.Tags || []}
                onSelectionChange={(tags) => handleTags(item, tags)}
                trigger={trigger}
              />

              <Button
                action="negative"
                variant="link"
                alignSelf="center"
                onPress={() => deleteListItem(item)}
              >
                <ButtonIcon as={CloseIcon} color="$red700" />
              </Button>
            </HStack>
          </ListItem>
        )}
        keyExtractor={(item) => `${item.Address}`}
      />

      {!list.length ? (
        <Text p="$4" flexWrap="wrap">
          There are no multicast proxy rules configured yet
        </Text>
      ) : null}
      <Button
        sx={{ '@md': { display: list.length ? 'none' : 'none' } }}
        rounded="$none"
        onPress={() => refModal.current()}
      >
        <ButtonText>Add Multicast Service</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

export default MulticastPorts
