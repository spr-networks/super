import React, { useContext, useEffect, useState } from 'react'
import { wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import {
  Badge,
  View,
  Box,
  Heading,
  Stack,
  HStack,
  FlatList,
  Text,
  useBreakpointValue,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

const Arp = (props) => {
  const [list, setList] = useState()

  const context = useContext(AlertContext)

  let translateFlags = (number) => {
    number = parseInt(number, 16)
    let translation = ''
    if ((number & 0x2) == 0x2) {
      translation += ' C'
    }

    if ((number & 0x4) == 4) {
      translation += ' PERM'
    }

    translation += ' (' + number + ')'

    return translation
  }

  const refreshList = async () => {
    let arp = await wifiAPI.arp().catch((error) => {
      this.context.error('API Failure: ' + error.message)
    })

    arp = arp.sort((a, b) => {
      const num1 = Number(
        a.IP.split('.')
          .map((num) => `000${num}`.slice(-3))
          .join('')
      )
      const num2 = Number(
        b.IP.split('.')
          .map((num) => `000${num}`.slice(-3))
          .join('')
      )
      return num1 - num2
    })

    setList(arp)
  }

  useEffect(() => {
    refreshList()
  }, [])

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  return (
    <View h={'100%'}>
      <Heading fontSize="md" p={4}>
        ARP Table
      </Heading>

      <FlashList
        data={list}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <Box
            bg="warmGray.50"
            borderBottomWidth="1"
            _dark={{
              bg: 'blueGray.800',
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            p={4}
          >
            <HStack space={3} justifyContent="space-between">
              <Stack
                minW="40%"
                style={{ flexDirection }}
                space={3}
                justifyContent="space-between"
              >
                <Text bold>{item.IP}</Text>
                <Text color="muted.500">{item.MAC}</Text>
              </Stack>
              <Stack
                minW="40%"
                style={{ flexDirection }}
                space={3}
                justifyContent="space-between"
              >
                <Text fontSize="xs">Flags: {translateFlags(item.Flags)}</Text>
                <Box marginLeft="auto">
                  <Badge variant="outline">{item.Device}</Badge>
                </Box>
              </Stack>
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => item.IP}
      />
    </View>
  )
}

export default Arp
