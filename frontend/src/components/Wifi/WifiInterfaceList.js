import { useEffect, useState } from 'react'

import { wifiAPI } from 'api'

import {
  Badge,
  Box,
  Button,
  Divider,
  FlatList,
  Flex,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

const WifiInterface = (props) => {
  const [activeTab, setActiveTab] = useState('devices')
  const { iw } = props

  let tabList = [
    'devices',
    'supported_interface_modes',
    'supported_commands',
    'supported_ciphers',
    'supported_extended_features',
    'device_supports',
    'bands',
    'other'
  ]

  /*const toggleIfaceState = (iface, state) => {
    wifiAPI.ipLinkState(iface, state ? 'up' : 'down').then((res) => {})
  }*/

  const dList = (dict, type = 'row') => {
    if (Object.keys(dict) && type == 'inline') {
      return (
        <>
          {Object.keys(dict).map((label) => (
            <HStack space={2}>
              <Text bold>{label}</Text>
              <Text>{dict[label]}</Text>
            </HStack>
          ))}
        </>
      )
    }
    return (
      <VStack space={1} justifyContent="center">
        {Object.keys(dict).map((label) => (
          <>
            <HStack space={2}>
              <Text w="1/6" bold>
                {label}
              </Text>
              <VStack flex="2" space={2} justifyContent="center">
                {typeof dict[label] == 'object' ? (
                  <Text>{dList(dict[label], 'inline')}</Text>
                ) : (
                  <Text>{dict[label]}</Text>
                )}
              </VStack>
            </HStack>
          </>
        ))}
      </VStack>
    )
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <Heading fontSize="lg">{iw.wiphy}</Heading>

      <Divider mt="2" />

      <Stack direction="row" space={4}>
        <VStack borderRightWidth={1} borderRightColor="muted.200">
          {tabList.map((tab) =>
            iw[tab] || tab == 'other' ? (
              <Button
                variant="ghost"
                rounded={false}
                colorScheme={activeTab === tab ? 'primary' : 'muted.500'}
                onPress={() => setActiveTab(tab)}
              >
                {tab.replace(/_/g, ' ').replace('supported ', '')}
              </Button>
            ) : null
          )}
        </VStack>

        <Box p="2">
          {tabList.map((tab) =>
            iw[tab] || tab == 'other' ? (
              <VStack display={activeTab == tab ? 'flex' : 'none'}>
                {tab == 'devices' ? (
                  <>
                    {Object.keys(iw[tab]).map((iface) => (
                      <VStack space={4}>
                        <HStack space={1} alignItems="center">
                          <Heading fontSize="lg">{iface}</Heading>
                          <Text fontSize="sm" color="muted.500">
                            {iw[tab][iface].type}
                          </Text>
                        </HStack>
                        {dList(iw[tab][iface])}
                        <Divider my="4" />
                      </VStack>
                    ))}
                  </>
                ) : (
                  <>
                    {tab == 'other' ? (
                      <VStack space={2}>
                        {Object.keys(iw)
                          .filter((k) => !tabList.includes(k) && k != 'bands')
                          .map((k) => (
                            <HStack space={2}>
                              <Text bold>{k}</Text>
                              <Text>{iw[k]}</Text>
                            </HStack>
                          ))}
                      </VStack>
                    ) : null}
                    {tab == 'bands' ? (
                      <>
                        {iw.bands.map((band) => (
                          <VStack
                            space={2}
                            borderBottomWidth={1}
                            borderBottomColor="muted.200"
                            pb="4"
                            mb="4"
                          >
                            <Heading fontSize="sm" color="muted.500">
                              {band.band}
                            </Heading>

                            {Object.keys(band)
                              .filter((l) => l !== 'band')
                              .map((label) => (
                                <HStack space={2}>
                                  <Text bold>{label}</Text>
                                  <Box flex={2}>
                                    {band[label].map((v) => (
                                      <Text>{v}</Text>
                                    ))}
                                  </Box>
                                </HStack>
                              ))}
                          </VStack>
                        ))}
                      </>
                    ) : null}
                    {tab.includes('support') &&
                    iw['supported_interface_modes'] ? (
                      <VStack space={4}>
                        <Heading fontSize="sm" color="muted.500">
                          {tab.replace(/_/g, ' ')}
                        </Heading>
                        <Stack
                          maxW="64vw"
                          space={2}
                          direction="row"
                          flexWrap="wrap"
                        >
                          {iw[tab] &&
                            iw[tab].map((c) => (
                              <Badge
                                variant="outline"
                                colorScheme="primary"
                                mb="2"
                              >
                                {c}
                              </Badge>
                            ))}
                        </Stack>

                        {tab == 'supported_interface_modes' ? (
                          <>
                            <Heading fontSize="sm">
                              software interface modes (can always be added)
                            </Heading>

                            <HStack space={1}>
                              {iw['supported_interface_modes'].map((c) => (
                                <Badge variant="outline" colorScheme="primary">
                                  {c}
                                </Badge>
                              ))}
                            </HStack>

                            <Heading fontSize="sm" color="muted.500">
                              valid interface combinations
                            </Heading>
                            <Text italic>
                              {iw['valid_interface_combinations']}
                            </Text>
                          </>
                        ) : null}
                      </VStack>
                    ) : null}
                  </>
                )}
              </VStack>
            ) : null
          )}
        </Box>
      </Stack>
    </Box>
  )
}

const WifiInterfaceList = (props) => {
  const [devs, setDevs] = useState({})
  const [iws, setIws] = useState([])
  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })
        setIws(iws)
      })
    })
  }, [])

  return (
    <>
      <Stack>
        {iws.length ? (
          <>
            {iws.map((iw) => (
              <WifiInterface iw={iw} />
            ))}
          </>
        ) : null}
      </Stack>
    </>
  )
}

export default WifiInterfaceList
