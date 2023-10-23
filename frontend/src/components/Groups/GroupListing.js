import React from 'react'
import PropTypes from 'prop-types'
import { groupDescriptions } from 'api/Group'

import {
  Badge,
  BadgeIcon,
  BadgeText,
  Box,
  FlatList,
  HStack,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { CableIcon, WifiIcon } from 'lucide-react-native'
import { InterfaceItem } from 'components/TagItem'

const GroupListing = ({ group, ...props }) => {
  const translateName = (name) => {
    if (name === 'dns') {
      return 'DNS'
    } else if (name === 'lan') {
      return 'LAN'
    } else if (name == 'wan') {
      return 'Internet (wan)'
    }
    return name
  }

  const list = []
  let idx = 0
  if (group.Members?.length > 0) {
    for (const dev of group.Members) {
      //if the device was in the vmap, mark it as active
      dev.ifname = ''
      dev.key = idx++

      if (group.vmap) {
        for (const entry of group.vmap) {
          // NOTE not all maps have ether_addr so also match on ip
          if (entry.ifname && entry.ether_addr == dev.MAC) {
            dev.ifname = entry.ifname

            if (dev.IP) {
              continue
            }

            if (entry.ipv4_addr) {
              dev.IP = entry.ipv4_addr
            } else if (group.ipMap && group.ipMap[dev.MAC]) {
              dev.IP = group.ipMap[dev.MAC].IP
            }
          } else if (
            entry.ifname &&
            entry.ipv4_addr &&
            entry.ipv4_addr == dev.RecentIP
          ) {
            dev.ifname = entry.ifname

            if (dev.IP) {
              continue
            }

            dev.IP = entry.ipv4_addr
          }
        }
      }

      list.push(dev)
    }
  }

  return (
    <FlatList
      ListHeaderComponent={
        <ListHeader
          title={translateName(group.Name)}
          description={groupDescriptions[group.Name] || ''}
        ></ListHeader>
      }
      data={list}
      estimatedItemSize={100}
      renderItem={({ item }) => (
        <ListItem>
          <Text flex={1} bold size="sm">
            {item.Name}
          </Text>

          <VStack flex={2} space="sm">
            <Text size="sm" bold>
              {item.IP || ' '}
            </Text>
            <Text size="sm" color="$muted500">
              {item.MAC}
            </Text>
          </VStack>

          <HStack flex={1} justifyContent="flex-end">
            <InterfaceItem name={item?.ifname} />
          </HStack>
        </ListItem>
      )}
    />
  )
}

GroupListing.propTypes = {
  group: PropTypes.object
}

export default GroupListing
