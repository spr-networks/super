import React, { useContext } from 'react'
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

import { AppContext } from 'AppContext'
import { ListHeader, ListItem } from 'components/List'
import { CableIcon, WifiIcon } from 'lucide-react-native'
import { InterfaceItem } from 'components/TagItem'
import DeviceItem from 'components/Devices/DeviceItem'

const mapDeviceVMAP = (dev, group) => {
  dev.ifname = ''
  if (!group.vmap) {
    return dev
  }

  //if the device was in the vmap, mark it as active
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
      dev.IP = dev.IP || entry.ipv4_addr
    }
  }

  return dev
}

const getGroupMembers = (group) => {
  if (!group.Members?.length) {
    return []
  }

  const list = group.Members.map((dev) => mapDeviceVMAP(dev, group))

  //sort by ip asc, offline last
  const iplp = (ip) => parseInt(ip?.split('.')[3] || 256)
  return list.sort((a, b) => {
    return parseInt(iplp(a.IP)) - parseInt(iplp(b.IP))
  })
}

const GroupListing = ({ group, ...props }) => {
  const appContext = useContext(AppContext)
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


  const list = getGroupMembers(group)
  return (
    <FlatList
      ListHeaderComponent={
        <ListHeader
          title={translateName(group.Name)}
          description={groupDescriptions[group.Name] || ''}
        />
      }
      data={list}
      estimatedItemSize={100}
      renderItem={({ item }) => (
        <ListItem>
          {/*
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
            */}
          <DeviceItem
            item={appContext.getDevice(item.MAC, 'MAC')}
            w="$1/2"
            justifyContent="space-between"
          />

          <HStack justifyContent="flex-end">
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
