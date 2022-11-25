import React from 'react'
import PropTypes from 'prop-types'
import { groupDescriptions } from 'api/Group'

import {
  Badge,
  Box,
  Heading,
  Stack,
  HStack,
  Text,
  VStack,
  useColorModeValue
} from 'native-base'

import { FlashList } from "@shopify/flash-list";

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
  if (group.Members && group.Members.length > 0) {
    for (const dev of group.Members) {
      //if the device was in the vmap, mark it as active
      dev.ifname = ''

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
    <VStack space={2}>
      <HStack
        space={1}
        alignItems="center"
        justifyContent="space-between"
        p={4}
      >
        <Heading fontSize="md">{translateName(group.Name)}</Heading>
        <Text color="muted.500">{groupDescriptions[group.Name] || ''}</Text>
      </HStack>

      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        _rounded={{ md: 'md' }}
        p={4}
      >
        <FlashList
          data={list}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth={1}
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py={2}
            >
              <HStack
                space={2}
                alignItems="center"
                justifyContent="space-between"
              >
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
          keyExtractor={(item) => item.Name}
        />
      </Box>
    </VStack>
  )
}

GroupListing.propTypes = {
  group: PropTypes.object
}

export default GroupListing
