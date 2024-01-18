import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { groupDescriptions } from 'api/Group'

import {
  Badge,
  BadgeIcon,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  FlatList,
  HStack,
  TrashIcon,
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

const GroupListing = ({ group, deleteGroup, ...props }) => {
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
    <HStack>
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
            <DeviceItem
              item={appContext.getDevice(item.MAC, 'MAC')}
              sx={{ '@md': { width: '$1/2' } }}
              justifyContent="space-between"
            />

            <HStack justifyContent="flex-end">
              <InterfaceItem name={item?.ifname} />
            </HStack>
          </ListItem>
        )}
      />
      {deleteGroup && list.length == 0 ? (
        <Button
          action="danger"
          variant="link"
          size="sm"
          onPress={() => deleteGroup(group.Name)}
        >
          <ButtonIcon as={TrashIcon} color="$red700" />
        </Button>
      ) : null}
    </HStack>
  )
}

GroupListing.propTypes = {
  group: PropTypes.object,
  deleteGroup: PropTypes.func
}

export default GroupListing
