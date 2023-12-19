import React, { useEffect, useState } from 'react'

import { wifiAPI } from 'api'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  Divider,
  FlatList,
  Heading,
  Icon,
  ScrollView,
  HStack,
  VStack,
  SectionList,
  Text,
  View
} from '@gluestack-ui/themed'

import { Accordion } from 'components/Accordion'

import { AlertCircleIcon, CheckCircleIcon, WifiIcon } from 'lucide-react-native'

//import { FlashList } from '@shopify/flash-list'

const WifiInterface = ({ iw, ...props }) => {
  const [activeTab, setActiveTab] = useState('SPR compatibility')

  let tabList = [
    'SPR compatibility',
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
          estimatedItemSize={100}
          renderItem={({ item }) => (
            <HStack space="md">
              <Text bold>{item}</Text>
              <Text>{dict[item]}</Text>
            </HStack>
          )}
        />
      )
    }

    return (
      <VStack space="md" justifyContent="center">
        {Object.keys(dict).map((label) => (
          <HStack key={label} space="md">
            <Text w="$1/4" bold>
              {label}
            </Text>
            <VStack flex={2} space="md" justifyContent="center">
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
    <View
      key={iw.wiphy}
      bg="$backgroundCardLight"
      minHeight={400}
      maxHeight={400}
      sx={{
        _dark: { bg: '$backgroundCardDark' },
        '@md': { minHeight: 420, maxHeight: 420 }
      }}
    >
      <VStack
        sx={{
          '_@md': { flexDirection: 'row' },
          _dark: { borderColor: '$borderColorCardDark' }
        }}
        space="md"
        my="$2"
        rounded="$md"
        borderWidth="$0"
        borderColor="$borderColorCardLight"
        flex={1}
      >
        <ScrollView w="$full" horizontal pb="$2">
          <HStack
            sx={{
              _dark: { borderRightColor: '$borderColorCardDark' }
            }}
            p="$2"
            px="$2"
            space="md"
            w="$full"
          >
            {tabList.map((tab) =>
              iw[tab] || ['other', 'SPR compatibility'].includes(tab) ? (
                <Button
                  key={tab}
                  action={activeTab === tab ? 'primary' : 'secondary'}
                  variant={activeTab === tab ? 'outline' : 'link'}
                  p="$1.5"
                  size="sm"
                  rounded={false}
                  justifyContent={'flex-start'}
                  onPress={() => setActiveTab(tab)}
                >
                  <ButtonText>
                    {tab.replace(/_/g, ' ').replace('supported ', '')}
                  </ButtonText>
                </Button>
              ) : null
            )}
          </HStack>
        </ScrollView>

        <ScrollView h="$full" p="$2" sx={{ '_@md': { w: '$2/3' } }}>
          {tabList.map((tab) =>
            iw[tab] || ['other', 'SPR compatibility'].includes(tab) ? (
              <VStack key={tab} display={activeTab == tab ? 'flex' : 'none'}>
                {tab == 'devices' ? (
                  <>
                    {Object.keys(iw[tab]).map((iface) => (
                      <VStack key={iface} space="md">
                        <HStack space="sm" alignItems="center">
                          <Heading size="md">{iface}</Heading>
                          <Text size="sm" color="$muted500">
                            {iw[tab][iface].type}
                          </Text>
                        </HStack>
                        {dList(iw[tab][iface])}
                        <Divider my="$4" />
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
                            <VStack
                              sx={{ '@md': { w: '$2/3' } }}
                              flexWrap="wrap"
                              mb="$2"
                            >
                              <Text bold>{item}</Text>
                              <Text>{iw[item]}</Text>
                            </VStack>
                          )}
                          keyExtractor={(item) => item}
                          estimatedItemSize={100}
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
                          <Heading size="md">{title}</Heading>
                        )}
                        renderSectionFooter={() => <Divider my="$2" />}
                        renderItem={({ item }) => (
                          <VStack py="$2">
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
                      <VStack space="md">
                        <Heading size="md" color="$muted500">
                          {tab.replace(/_/g, ' ')}
                        </Heading>
                        <HStack
                          space="md"
                          flexWrap="wrap"
                          sx={{ '@md': { maxW: '$2/3' } }}
                        >
                          {iw[tab] &&
                            iw[tab].map((c) => (
                              <Box key={c} mb="$2">
                                {tab.match(/extended/) ? (
                                  <Text isTruncated>{c}</Text>
                                ) : (
                                  <Badge action="muted" variant="outline">
                                    <BadgeText>{c}</BadgeText>
                                  </Badge>
                                )}
                              </Box>
                            ))}
                        </HStack>

                        {/*tab == 'supported_interface_modes' ? (
                          <>
                            <Heading size="sm">
                              software interface modes (can always be added)
                            </Heading>

                            <HStack space={1} flexWrap="wrap">
                              {iw['supported_interface_modes'].map((c) => (
                                <Badge variant="outline" colorScheme="primary">
                                  {c}
                                </Badge>
                              ))}
                            </HStack>

                            <Heading size="sm" color="$muted500">
                              valid interface combinations
                            </Heading>
                            <Text italic>
                              {iw['valid_interface_combinations']}
                            </Text>
                          </>
                              ) : null*/}
                      </VStack>
                    ) : null}

                    {tab == 'SPR compatibility' ? (
                      <VStack space="md">
                        <Text bold>SPR compatibility for {iw.wiphy}</Text>

                        <HStack space="md" alignItems="center">
                          <Icon
                            as={
                              iw.bands.length > 1
                                ? CheckCircleIcon
                                : AlertCircleIcon
                            }
                            color={
                              iw.bands.length > 1
                                ? '$success600'
                                : '$warning600'
                            }
                            size="lg"
                          />
                          <Text w={100}>5GHz</Text>
                          <Text
                            flex={1}
                            color="$muted500"
                            size="sm"
                            flexWrap="wrap"
                          >
                            Recommended for maximum speed
                          </Text>
                        </HStack>
                        <HStack space="md" alignItems="center">
                          <Icon
                            as={
                              iw.supported_ciphers.includes(
                                'GCMP-128 (00-0f-ac:8)'
                              )
                                ? CheckCircleIcon
                                : AlertCircleIcon
                            }
                            color={
                              iw.supported_ciphers.includes(
                                'GCMP-128 (00-0f-ac:8)'
                              )
                                ? '$success600'
                                : '$warning600'
                            }
                            size="lg"
                          />

                          <Text w={100}>WPA3/SAE</Text>
                          <Text
                            flex={1}
                            color="$muted500"
                            size="sm"
                            flexWrap="wrap"
                          >
                            Recommended for better security
                          </Text>
                        </HStack>
                        <HStack space="md" alignItems="center">
                          <Icon
                            as={
                              iw.supported_interface_modes.includes('AP/VLAN')
                                ? CheckCircleIcon
                                : AlertCircleIcon
                            }
                            color={
                              iw.supported_interface_modes.includes('AP/VLAN')
                                ? '$success600'
                                : '$error600'
                            }
                            size="lg"
                          />

                          <Text w={100}>AP/VLAN</Text>
                          <Text
                            flex={1}
                            color="$muted500"
                            size="sm"
                            flexWrap="wrap"
                          >
                            Required to create virtual interfaces
                          </Text>
                        </HStack>
                      </VStack>
                    ) : null}
                  </>
                )}
              </VStack>
            ) : null
          )}
        </ScrollView>
      </VStack>
    </View>
  )
}

const WifiInterfaceList = (props) => {
  const [devs, setDevs] = useState({})
  const [iws, setIws] = useState([])
  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)

      /*
      //TBD also grab interfacesConfiguration.
      // The UI should handle interfaces that are configured,
      // but not active on the system.
      wifiAPI.interfacesConfiguration().then((config) => {

      })
      */

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })
        setIws(iws)
      })
    })
  }, [])

  const getMainDev = (item) => {
    let devKey = Object.keys(item.devices)
      .filter((dev) => !dev.includes('.'))
      ?.pop()

    return item.devices[devKey]
  }

  const getDesc = (item) => {
    let dev = getMainDev(item)
    if (dev?.type == 'AP' && dev.ssid) {
      return `${dev.type}: ${dev.ssid}`
    }

    return `${dev.type}`
  }

  const getIconColor = (item) => {
    let dev = getMainDev(item)
    if (dev?.type == 'AP' && dev.ssid) {
      return '$success500'
    }

    return '$primary500'
  }

  const items = iws.map((item) => ({
    label: item.wiphy,
    description: getDesc(item),
    icon: WifiIcon,
    colorIcon: getIconColor(item),
    renderItem: () => <WifiInterface iw={item} />
  }))

  return (
    <View flex={1}>
      <Accordion items={items} open={['phy0']} showDescription={true} />
    </View>
  )
}

export default WifiInterfaceList
