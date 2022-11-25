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
  Text,
  useBreakpointValue,
  useColorModeValue
} from 'native-base'

import { FlashList } from "@shopify/flash-list";

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
    <View>
      <Heading fontSize="md" p={4}>
        ARP Table
      </Heading>

      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        _rounded={{ md: 'md' }}
        width="100%"
        p={4}
        mb={4}
      >
        <FlashList
          data={list}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth="1"
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py="2"
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
      </Box>
    </View>
  )
}

export default Arp
