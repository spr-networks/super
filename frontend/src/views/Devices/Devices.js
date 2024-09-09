import React, { useContext, useEffect, useState } from 'react'

import {
  View,
  Text,
  HStack,
  Button,
  ButtonText,
  Fab,
  FabIcon,
  FabLabel,
  AddIcon,
  FormControlLabelText
} from '@gluestack-ui/themed'

import { SelectMenu } from 'components/InputSelect'

import { deviceAPI, wifiAPI, meshAPI } from 'api'
import APIWifi from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import { AlertContext, AppContext } from 'AppContext'

import { ListHeader } from 'components/List'
import DeviceList from 'components/Devices/DeviceList'
import { Select } from 'components/Select'
import { strToDate } from 'utils'

//import ActionSheet from 'components/ActionSheet'
import { XIcon, TagIcon, UsersIcon } from 'lucide-react-native'

//TODO support multi on/off select
const TagSelect = ({ sections, value, onChange, ...props }) => {
  const [isOpen, setIsOpen] = useState(false)

  let menuProps = {}
  let options = [{ label: 'Show All', value: null, icon: XIcon }]
  for (let s of sections) {
    if (s.title == 'Groups') {
      let opts = s.data.map((v) => ({
        label: v,
        value: { Group: v },
        icon: UsersIcon
      }))
      options = [...options, ...opts]
    } else if (s.title == 'Tags') {
      let opts = s.data.map((v) => ({
        label: v,
        value: { Tag: v },
        icon: TagIcon
      }))
      options = [...options, ...opts]
    }
  }

  menuProps.options = options

  menuProps.trigger = (triggerProps) => {
    return (
      <Button size="xs" action="primary" variant="outline" {...triggerProps}>
        <ButtonText>{value || 'Groups and tags'}</ButtonText>
      </Button>
    )
  }

  return (
    <SelectMenu
      onChange={(v) => {
        onChange(v)
      }}
      value={value}
      {...menuProps}
    />
  )

  /*return (
    <>
      <ActionSheet
        onChange={onChange}
        value={value}
        placeholder="Tags and groups"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        sections={[
          {
            data: ['Show All']
          },
          ...sections
        ]}
      />
    </>
  )*/
}

const Devices = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const navigate = useNavigate()

  const [list, setList] = useState([])
  const [tags, setTags] = useState([])
  const [groups, setGroups] = useState([])
  const [sortBy, setSortBy] = useState('online')
  const [filter, setFilter] = useState({}) // filter groups,tags
  const [unknownMacs, setUnknownMacs] = useState([])

  const warnUnknown = (context, devices, associated) => {
    let macs = devices.map(dev => dev.MAC)
    let unknown_macs  = []
    for (let mac of associated) {
      if (!macs.includes(mac)) {
        unknown_macs.push(mac)
      }
    }

    setUnknownMacs(u => {
      let newArray = new Array(...new Set(u.concat(unknown_macs)))
      if (newArray.length != 0) {
        context.warning("Devices attempting to connect, but may have the wrong wifi password: " + (newArray).join(", "))
      }
      return newArray
    })

  }

  const gatherStationsByFlag = (stations, flag, invert) => {
    let authorized = []
    for (let station in stations) {
      let includes = stations[station].flags.includes(flag)
      if (invert != true && includes) {
        authorized.push(station)
      } else if (invert && !includes) {
        authorized.push(station)
      }
    }
    return authorized
  }

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

        setTags([
          ...new Set(
            devices
              .map((d) => d.DeviceTags)
              .filter((t) => t.length)
              .flat()
          )
        ])

        setGroups([
          ...new Set(
            devices
              .map((d) => d.Groups)
              .filter((t) => t.length)
              .flat()
          )
        ])

        if (macs && macs.length > 0) {
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
        }

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
                    let connectedMACs = gatherStationsByFlag(stations, "[AUTHORIZED]", false)
                    let associatedNotConnected = gatherStationsByFlag(stations, "[AUTHORIZED]", true)
                    warnUnknown(context, devices, associatedNotConnected)

                    let devs = devices.map((dev) => {
                      if (dev.isConnected !== true) {
                        dev.isConnected = connectedMACs.includes(dev.MAC)
                        dev.isAssociatedOnly = associatedNotConnected.includes(dev.MAC)
                      }


                      return dev
                    })

                    setList(devs.sort(sortDevices))
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
                            let connectedMACs = gatherStationsByFlag(stations, "[AUTHORIZED]", false)
                            let associatedNotConnected = gatherStationsByFlag(stations, "[AUTHORIZED]", true)
                            warnUnknown(context, devices, associatedNotConnected)

                            setList(
                              devices.map((dev) => {
                                if (dev.isConnected !== true) {
                                  dev.isConnected = connectedMACs.includes(
                                    dev.MAC
                                  )
                                  dev.isAssociatedOnly = associatedNotConnected.includes(dev.MAC)
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

  useEffect(() => {
    setList(
      list.map((d) => {
        //filter.group, filter.tag
        let match = false

        if (!filter.Tag && !filter.Group) {
          match = true
        } else {
          d.DeviceTags?.map((deviceTag) => {
            if (deviceTag.toLowerCase().startsWith(filter.Tag?.toLowerCase())) {
              match = true
            }
          })

          d.Groups?.map((group) => {
            if (group.toLowerCase().startsWith(filter.Group?.toLowerCase())) {
              match = true
            }
          })
        }

        d.hidden = match ? false : true

        return d
      })
    )
  }, [filter])

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
          <TagSelect
            sections={[
              {
                title: 'Groups',
                data: groups
              },
              {
                title: 'Tags',
                data: tags
              }
            ]}
            value={filter.Tag || filter.Group}
            onChange={(v) => {
              // v is either {Tag: t} or {Group: g}
              setFilter(v)
            }}
          />

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
        list={list.filter((d) => d.hidden !== true)}
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
