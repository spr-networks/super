import React from 'react'
import PropTypes from 'prop-types'
import { groupDescriptions } from 'api/Group'

import {
  Badge,
  Box,
  Heading,
  FlatList,
  Stack,
  HStack,
  Text,
  VStack,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

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
        <HStack
          space={1}
          alignItems="center"
          justifyContent="space-between"
          p={4}
        >
          <Heading fontSize="md">{translateName(group.Name)}</Heading>
          <Text color="muted.500">{groupDescriptions[group.Name] || ''}</Text>
        </HStack>
      }
      data={list}
      estimatedItemSize={100}
      renderItem={({ item }) => (
        <Box
          key={item.Name}
          bg="backgroundCardLight"
          borderBottomWidth={1}
          _dark={{
            bg: 'backgroundCardDark',
            borderColor: 'borderColorCardDark'
          }}
          borderColor="borderColorCardLight"
          p={4}
        >
          <HStack space={2} alignItems="center" justifyContent="space-between">
            <Text w="1/4" bold>
              {item.Name}
            </Text>

            <Stack
              direction={{ base: 'column', md: 'row' }}
              w="1/2"
              space={1}
              justifyContent="space-between"
            >
              <Text>{item.IP}</Text>
              <Text color="muted.500" fontSize="sm">
                {item.MAC}
              </Text>
            </Stack>
            <Box marginLeft="auto">
              {item.ifname ? (
                <Badge variant="outline">{item.ifname}</Badge>
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
