import React, { useContext, useEffect, useState } from 'react'

import {
  View,
  Text,
  HStack,
  Button,
  ButtonGroup,
  ButtonText,
  Fab,
  FabIcon,
  FabLabel,
  AddIcon,
  FormControl,
  FormControlLabel,
  FormControlLabelText
} from '@gluestack-ui/themed'

import { deviceAPI, wifiAPI, meshAPI } from 'api'
import APIWifi from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import { AlertContext, AppContext } from 'AppContext'

import { ListHeader } from 'components/List'
import DeviceList from 'components/Devices/DeviceList'
import { Select } from 'components/Select'
import { strToDate } from 'utils'

const Devices = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const navigate = useNavigate()

  const [list, setList] = useState([])
  const [sortBy, setSortBy] = useState('online')

  const sortDevices = (a, b) => {
    const parseIP = (ip) => {
      return ip.split('.').map(Number)
      //b.RecentIP.replace(/[^0-9]+/g, '')
    }

    if (sortBy == 'online') {
      return (
        parseInt(parseInt(+b.isConnected || 0) * 1000 + parseIP(a.RecentIP)) -
        parseInt(parseInt(+a.isConnected || 0) * 1000 + parseIP(b.RecentIP))
      )
    } else if (sortBy == 'date') {
      if (a.DHCPLastTime == '') {
        return 1
      }
      if (b.DHCPLastTime == '') {
        return -1
      }

      return strToDate(b.DHCPLastTime) - strToDate(a.DHCPLastTime)
    } else if (sortBy == 'name') {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase())
    } else if (sortBy == 'ip') {
      const aIP = parseIP(a.RecentIP)
      const bIP = parseIP(b.RecentIP)

      for (let i = 0; i <= 4; i++) {
        if (aIP[i] !== bIP[i]) {
          return aIP[i] - bIP[i]
        }
      }

      return 0
    }
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

        setList(devices.sort(sortDevices))

        // set device oui if avail
        deviceAPI
          .ouis(macs)
          .then((ouis) => {
            let devs = devices.map((d) => {
              let oui = ouis.find((o) => o.MAC == d.MAC)
              d.oui = oui ? oui.Vendor : ''
              return d
            })

            setList(devs.sort(sortDevices))
          })
          .catch((err) => {})

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

                    setList(devs)
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
                            setList(
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

  const handleRedirect = () => {
    if (appContext.isWifiDisabled) {
      navigate('/admin/wireguard')
    } else {
      navigate('/admin/add_device')
    }
  }

  useEffect(() => {
    refreshDevices(true)
  }, [])

  useEffect(() => {
    if (list?.length) {
      setList([...list.sort(sortDevices)])
    }
  }, [sortBy])

  const deleteListItem = (id) => {
    deviceAPI
      .deleteDevice(id)
      .then(refreshDevices)
      .catch((error) =>
        context.error('[API] deleteDevice error: ' + error.message)
      )
  }

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

        {/*TODO selector here, and filter toggle*/}

        <HStack space="md" alignItems="center">
          <FormControlLabelText size="sm">Sort by</FormControlLabelText>

          <Select
            selectedValue={sortBy}
            onValueChange={(value) => setSortBy(value)}
            w="$32"
            size="sm"
          >
            {['online', 'date', 'name', 'ip'].map((opt) => (
              <Select.Item key={opt} label={opt} value={opt} />
            ))}
          </Select>
        </HStack>

        {/*
        <ButtonGroup size="xs" space="xs">
          <Button action="primary" onPress={() => setSortBy('date')}>
            <ButtonText>Sort by Date</ButtonText>
          </Button>

          <Button action="primary" onPress={() => setSortBy('name')}>
            <ButtonText>Sort by Name</ButtonText>
          </Button>

          <Button action="primary" onPress={() => setSortBy('ip')}>
            <ButtonText>Sort by IP</ButtonText>
          </Button>
        </ButtonGroup>
        */}
      </ListHeader>

      <DeviceList
        list={list}
        notifyChange={refreshDevices}
        deleteListItem={deleteListItem}
      />

      {!list?.length ? (
        <View
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
        >
          <Text color="$muted500" p="$4">
            There are no devices configured yet
          </Text>
        </View>
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

export default Devices
