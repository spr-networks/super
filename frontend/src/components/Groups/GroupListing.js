import React from 'react'
import PropTypes from 'prop-types'
import { groupDescriptions } from 'api/Group'

import {
  Badge,
  BadgeText,
  Box,
  Heading,
  FlatList,
  HStack,
  Text,
  useColorMode
} from '@gluestack-ui/themed'

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

  const colorMode = useColorMode()

  return (
    <FlatList
      ListHeaderComponent={
        <HStack
          space={'sm'}
          alignItems="center"
          justifyContent="space-between"
          p={'$4'}
        >
          <Heading size="md">{translateName(group.Name)}</Heading>
          <Text color="$muted500">{groupDescriptions[group.Name] || ''}</Text>
        </HStack>
      }
      data={list}
      estimatedItemSize={100}
      renderItem={({ item }) => (
        <Box
          key={item.Name}
          bg={
            colorMode == 'light'
              ? '$backgroundCardLight'
              : '$backgroundCardDark'
          }
          borderColor={
            colorMode == 'light'
              ? '$borderColorCardLight'
              : '$borderColorCardDark'
          }
          borderBottomWidth={1}
          p="$4"
        >
          <HStack space="md" alignItems="center" justifyContent="space-between">
            <Text w="$1/4" bold size="sm">
              {item.Name}
            </Text>

            <Box
              sx={{
                '@base': { flexDirection: 'column' },
                '@md': { flexDirection: 'row' }
              }}
              w="$1/2"
              space="sm"
              justifyContent="space-between"
            >
              <Text size="sm">{item.IP}</Text>
              <Text color="$muted500" size="sm">
                {item.MAC}
              </Text>
            </Box>
            <Box ml="auto">
              {item.ifname ? (
                <Badge variant="outline" action="success">
                  <BadgeText>{item.ifname}</BadgeText>
                </Badge>
              ) : null}
            </Box>
          </HStack>
        </Box>
      )}
    />
  )
}

GroupListing.propTypes = {
  group: PropTypes.object
}

export default GroupListing
