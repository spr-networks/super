import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'

import {
  View,
  Divider,
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Spacer,
  Switch,
  Text,
  useBreakpointValue,
  useColorModeValue
} from 'native-base'

const Arp = (props) => {
  const [list, setList] = useState()

  const context = useContext(APIErrorContext)

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
    let divs = []

    let arp = await wifiAPI.arp().catch((error) => {
      this.context.reportError('API Failure: ' + error.message)
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

    /*
    for (const entry of arp) {

      divs.push(
        <tr key={generatedID}>
          <td className=""> {entry.IP} </td>
          <td className="">
            {' '}
            {entry.MAC == '00:00:00:00:00:00' ? '<incomplete>' : entry.MAC}
          </td>
          <td className=""> {translateFlags(entry.Flags)} </td>
          <td className=""> {entry.Device} </td>
        </tr>
      )
    }
    */
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
      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="md"
        width="100%"
        p="4"
      >
        <Heading>ARP Table</Heading>

        <FlatList
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
                  <Text>{item.Device}</Text>
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
