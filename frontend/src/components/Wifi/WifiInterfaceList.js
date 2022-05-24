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
  IconButton,
  ScrollView,
  Stack,
  HStack,
  VStack,
  SectionList,
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
        <FlatList
          data={Object.keys(dict)}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <HStack space={2}>
              <Text bold>{item}</Text>
              <Text>{dict[item]}</Text>
            </HStack>
          )}
        />
      )
    }

    return (
      <VStack space={1} justifyContent="center">
        {Object.keys(dict).map((label) => (
          <HStack key={label} space={2}>
            <Text w="1/4" bold>
              {label}
            </Text>
            <VStack flex={2} space={2} justifyContent="center">
              {typeof dict[label] == 'object' ? (
                <Box>{dList(dict[label], 'inline')}</Box>
              ) : (
                <Text>{dict[label]}</Text>
              )}
            </VStack>
          </HStack>
        ))}
      </VStack>
    )
  }

  return (
    <Box
      key={iw.wiphy}
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p={4}
    >
      <Heading fontSize="lg">{iw.wiphy}</Heading>

      <Stack
        direction={{ base: 'column', md: 'row' }}
        space={2}
        my={2}
        rounded="md"
        borderWidth={1}
        borderColor="muted.200"
      >
        <VStack borderRightWidth={1} borderRightColor="muted.200">
          {tabList.map((tab) =>
            iw[tab] || tab == 'other' ? (
              <Button
                key={tab}
                variant="ghost"
                rounded={false}
                colorScheme="primary"
                _text={{
                  color: activeTab === tab ? 'primary.600' : 'muted.500'
                }}
                onPress={() => setActiveTab(tab)}
              >
                {tab.replace(/_/g, ' ').replace('supported ', '')}
              </Button>
            ) : null
          )}
        </VStack>

        <ScrollView h="50vh" p={2}>
          {tabList.map((tab) =>
            iw[tab] || tab == 'other' ? (
              <VStack key={tab} display={activeTab == tab ? 'flex' : 'none'}>
                {tab == 'devices' ? (
                  <>
                    {Object.keys(iw[tab]).map((iface) => (
                      <VStack key={iface} space={4}>
                        <HStack space={1} alignItems="center">
                          <Heading fontSize="lg">{iface}</Heading>
                          <Text fontSize="sm" color="muted.500">
                            {iw[tab][iface].type}
                          </Text>
                        </HStack>
                        {dList(iw[tab][iface])}
                        <Divider my={4} />
                      </VStack>
                    ))}

                    {/*<SectionList
                      sections={[
                        { title: 'abc1', data: [0, 11] },
                        { title: 'abc2', data: [23] }
                      ]}
                      keyExtractor={(item, index) => index}
                      renderSectionHeader={({ section: { title } }) => (
                        <Text bold>{JSON.stringify(title)}</Text>
                      )}
                      renderItem={(item) => <Text>{JSON.stringify(item)}</Text>}
                    />*/}
                  </>
                ) : (
                  <>
                    {tab == 'other' ? (
                      <>
                        <FlatList
                          data={Object.keys(iw).filter(
                            (k) => !tabList.includes(k)
                          )}
                          renderItem={({ item }) => (
                            <VStack maxW="64vw" flexWrap="wrap" mb={2}>
                              <Text bold>{item}</Text>
                              <Text>{iw[item]}</Text>
                            </VStack>
                          )}
                          keyExtractor={(item) => item}
                        />
                      </>
                    ) : null}

                    {tab == 'bands' ? (
                      <SectionList
                        sections={iw.bands.map((band) => {
                          return {
                            title: band.band,
                            data: Object.keys(band)
                              .filter((k) => k !== 'band')
                              .map((label) => {
                                return { label, value: band[label] }
                              })
                          }
                        })}
                        keyExtractor={(item, index) => item.label}
                        renderSectionHeader={({ section: { title } }) => (
                          <Heading fontSize="md">{title}</Heading>
                        )}
                        renderSectionFooter={() => <Divider my={2} />}
                        renderItem={({ item }) => (
                          <VStack py={2}>
                            <Text bold>{item.label}</Text>
                            <VStack>
                              {item.value.map((v, index) => (
                                <Text key={index}>{v}</Text>
                              ))}
                            </VStack>
                          </VStack>
                        )}
                      />
                    ) : null}

                    {tab.includes('support') &&
                    iw['supported_interface_modes'] ? (
                      <VStack space={4}>
                        <Heading fontSize="md" color="muted.500">
                          {tab.replace(/_/g, ' ')}
                        </Heading>
                        <HStack maxW="64vw" space={2} flexWrap="wrap">
                          {iw[tab] &&
                            iw[tab].map((c) => (
                              <Box key={c} mb={2}>
                                {tab.match(/extended/) ? (
                                  <Text isTruncated>{c}</Text>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    colorScheme="primary"
                                  >
                                    {c}
                                  </Badge>
                                )}
                              </Box>
                            ))}
                        </HStack>

                        {/*tab == 'supported_interface_modes' ? (
                          <>
                            <Heading fontSize="sm">
                              software interface modes (can always be added)
                            </Heading>

                            <HStack space={1} flexWrap="wrap">
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
                              ) : null*/}
                      </VStack>
                    ) : null}
                  </>
                )}
              </VStack>
            ) : null
          )}
        </ScrollView>
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
      <VStack>
        {iws.length ? (
          <>
            {iws.map((iw) => (
              <WifiInterface key={iw.wiphy} iw={iw} />
            ))}
          </>
        ) : null}
      </VStack>
    </>
  )
}

export default WifiInterfaceList
