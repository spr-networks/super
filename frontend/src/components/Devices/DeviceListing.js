import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { deviceAPI, wifiAPI, meshAPI } from 'api'
import APIWifi from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import Device from 'components/Devices/Device'
import { AlertContext } from 'layouts/Admin'
import { AppContext } from 'AppContext'

import {
  Button,
  ButtonText,
  Box,
  Fab,
  FabIcon,
  FabLabel,
  FlatList,
  HStack,
  VStack,
  Pressable,
  Text,
  View,
  AddIcon,
  ThreeDotsIcon,
  CloseIcon
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'
import { SwipeListView } from 'components/SwipeListView'
import { ButtonIcon } from '@gluestack-ui/themed'
import { ListHeader } from 'components/List'

const DeviceListing = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

  const [devices, setDevices] = useState(null)
  const navigate = useNavigate()
  const [policies, setPolicies] = useState(['wan', 'dns', 'lan'])
  const [groups, setGroups] = useState([])
  const [tags, setTags] = useState([])

  const sortDevices = (a, b) => {
    return (
      parseInt(
        parseInt(+b.isConnected || 0) * 1000 +
          a.RecentIP.replace(/[^0-9]+/g, '')
      ) -
      parseInt(
        parseInt(+a.isConnected || 0) * 1000 +
          b.RecentIP.replace(/[^0-9]+/g, '')
      )
    )
  }

  const refreshDevices = (forceFetch = false) => {
    //NOTE use appContext for devices to avoid fetching x2
    //appContext.getDevices(forceFetch)
    deviceAPI
      .list()
      .then((devices) => {
        if (!devices) {
          return
        }

        if (!Array.isArray(devices)) {
          devices = Object.values(devices)
        }

        let macs = devices.filter((d) => d.MAC.includes(':')).map((d) => d.MAC)

        setDevices(devices.sort(sortDevices))

        // set device oui if avail
        deviceAPI
          .ouis(macs)
          .then((ouis) => {
            let devs = devices.map((d) => {
              let oui = ouis.find((o) => o.MAC == d.MAC)
              d.oui = oui ? oui.Vendor : ''
              return d
            })

            setDevices(devs.sort(sortDevices))
          })
          .catch((err) => {})

        setPolicies([
          ...new Set(devices.map((device) => device.Policies).flat())
        ])
        setGroups([...new Set(devices.map((device) => device.Groups).flat())])
        setTags([...new Set(devices.map((device) => device.DeviceTags).flat())])
        // TODO check wg status for virt
        if (!appContext.isWifiDisabled) {
          //for each interface
          wifiAPI.interfacesConfiguration().then((config) => {
            config
              .filter((iface) => iface.Type == 'AP' && iface.Enabled == true)
              .forEach((iface) => {
                wifiAPI
                  .allStations(iface.Name)
                  .then((stations) => {
                    let connectedMACs = Object.keys(stations)

                    let devs = devices.map((dev) => {
                      if (dev.isConnected !== true) {
                        dev.isConnected = connectedMACs.includes(dev.MAC)
                      }

                      return dev
                    })

                    devs.sort(sortDevices)

                    setDevices(devs)
                  })
                  .catch((err) => {
                    //context.error('WIFI API Failure', err)
                  })
              })
          })

          meshAPI
            .meshIter(() => new APIWifi())
            .then((r) =>
              r.forEach((remoteWifiApi) => {
                remoteWifiApi.interfacesConfiguration
                  .call(remoteWifiApi)
                  .then((config) => {
                    config
                      .filter(
                        (iface) => iface.Type == 'AP' && iface.Enabled == true
                      )
                      .forEach((iface) => {
                        remoteWifiApi.allStations
                          .call(remoteWifiApi, iface.Name)
                          .then((stations) => {
                            let connectedMACs = Object.keys(stations)
                            setDevices(
                              devices.map((dev) => {
                                if (dev.isConnected !== true) {
                                  dev.isConnected = connectedMACs.includes(
                                    dev.MAC
                                  )
                                }

                                return dev
                              })
                            )
                          })
                          .catch((err) => {
                            context.error(
                              'WIFI API Failure ' +
                                remoteWifiApi.remoteURL +
                                ' ' +
                                iface.Name,
                              err
                            )
                          })
                      })
                  })
              })
            )
            .catch((err) => {})
        }
      })
      .catch((err) => {
        context.error('API Failure', err)
      })
  }

  useEffect(() => {
    refreshDevices(true)
  }, [])

  const handleRedirect = () => {
    if (appContext.isWifiDisabled) {
      navigate('/admin/wireguard')
    } else {
      navigate('/admin/add_device')
    }
  }

  const renderItem = ({ item }) => (
    <Device
      key={item.MAC || item.WGPubKey} //keyExtractor is recommended, however, this fixes a bug on react web
      device={item}
      showMenu={true}
      groups={groups}
      policies={policies}
      tags={tags}
      notifyChange={() => refreshDevices(true)}
    />
  )

  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    closeRow(rowMap, rowKey)

    const newData = [...devices]
    const prevIndex = devices.findIndex(
      (item) => item.MAC === rowKey || item.WGPubKey == rowKey
    )
    newData.splice(prevIndex, 1)
    setDevices(newData)

    deviceAPI
      .deleteDevice(rowKey)
      .then(() => refreshDevices(true))
      .catch((error) =>
        context.error('[API] deleteDevice error: ' + error.message)
      )
  }

  const renderHiddenItem = (data, rowMap) => (
    <HStack flex={1} pl="$2" my="$1">
      <Pressable
        w={70}
        ml="auto"
        cursor="pointer"
        bg="$coolGray200"
        justifyContent="center"
        disabled={data.item.MAC == 'pending'}
        onPress={() =>
          navigate(
            `/admin/devices/${
              data.item.MAC || encodeURIComponent(data.item.WGPubKey)
            }`
          )
        }
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space="md">
          <ThreeDotsIcon color="$coolGray800" />
          <Text size="xs" fontWeight="medium" color="$coolGray800">
            Edit
          </Text>
        </VStack>
      </Pressable>
      <Pressable
        w={70}
        cursor="pointer"
        bg="$red500"
        justifyContent="center"
        onPress={() => deleteRow(rowMap, data.item.MAC || data.item.WGPubKey)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space="md">
          <CloseIcon color="$white" />
          <Text size="xs" color="$white" fontWeight="$medium">
            Delete
          </Text>
        </VStack>
      </Pressable>
    </HStack>
  )

  return (
    <View h="$full">
      <ListHeader title="Devices">
        {/*<Button
          size="xs"
          action="primary"
          variant="solid"
          display="none"
          sx={{
            '@md': { display: 'flex' }
          }}
          onPress={handleRedirect}
        >
          <ButtonText>Add</ButtonText>
          <ButtonIcon as={AddIcon} ml="$2" />
        </Button>*/}

        {/*<Button
            size="sm"
            variant="ghost"
            colorScheme="blueGray"
            leftIcon={<Icon icon={faFilter} />}
            onPress={() => {}}
            >
            Filter
          </Button>*/}
      </ListHeader>

      {Platform.OS == 'ios' ? (
        <SwipeListView
          data={devices}
          renderItem={renderItem}
          renderHiddenItem={renderHiddenItem}
          keyExtractor={(item, index) => item.MAC || item.WGPubKey || index}
          rightOpenValue={-140}
        />
      ) : (
        <>
          <FlatList
            data={devices}
            renderItem={renderItem}
            estimatedItemSize={120}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        </>
      )}

      {devices !== null && !devices.length ? (
        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
        >
          <Text color="$muted500" p="$4">
            There are no devices configured yet
          </Text>
        </Box>
      ) : null}

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={handleRedirect}
        bg="$primary500"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Device</FabLabel>
      </Fab>
    </View>
  )
}

export default DeviceListing
