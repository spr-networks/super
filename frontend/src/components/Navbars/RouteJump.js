import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from 'AppContext'

import {
  HStack,
  Text,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Pressable,
  Popover,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
  Icon,
  FormControl,
  VStack,
  ScrollView
} from '@gluestack-ui/themed'

import { SearchIcon, SlashIcon } from 'lucide-react-native'

import { routes } from 'routes'

import { GlobalHotKeys, HotKeys } from 'react-hotkeys'
import { Platform } from 'react-native'

const RouteJump = ({ ...props }) => {
  const { activeSidebarItem, setActiveSidebarItem, getDevices } =
    useContext(AppContext)
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState([])
  const [devices, setDevices] = useState([])
  const [filterText, setFilterText] = useState('')
  const navigate = useNavigate()

  const refInput = React.useRef(null)

  const sortDevices = (a, b) => {
    const parseIP = (ip) => {
      return ip.split('.').map(Number)
      //b.RecentIP.replace(/[^0-9]+/g, '')
    }

    const aIP = parseIP(a.RecentIP)
    const bIP = parseIP(b.RecentIP)

    for (let i = 0; i <= 4; i++) {
      if (aIP[i] !== bIP[i]) {
        return aIP[i] - bIP[i]
      }
    }

    return 0
  }

  useEffect(() => {
    let items = []
    //flatten the routes
    routes.map((r) => {
      if (r.layout == 'auth' || r.redirect || r.hidden) return

      if (r.views) {
        let cr = r.views
          .map((rr) => {
            if (rr.redirect || rr.hidden) {
              return null
            }

            return { name: rr.name, path: rr.path, icon: rr.icon }
          })
          .filter((rr) => rr)

        items = [...items, ...cr]
      } else {
        items.push({ name: r.name, path: r.path, icon: r.icon })
      }
    })

    getDevices()
      .then((d) => {
        setDevices(d.sort(sortDevices))
      })
      .catch(() => {})

    setItems(items)
  }, [])

  const onPress = () => {
    setIsOpen(true)
    refInput.current?.focus()
  }

  const trigger = (triggerProps) => (
    <Pressable
      px="$4"
      {...triggerProps}
      onPress={onPress}
      sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
    >
      <Input size="sm" rounded="$md" w={250}>
        <InputSlot pl="$3">
          <InputIcon as={SearchIcon} />
        </InputSlot>
        <InputField
          value=""
          onChangeText={() => {}}
          onSubmitEditing={() => {}}
          placeholder="Type / to search"
        />
        {/*
        <InputSlot mr="$2">
          <Text
            size="xs"
            color="$muted400"
            _bg="$muted100"
            px="$2"
            rounded="$md"
          >
            /
          </Text>
        </InputSlot>
        */}
      </Input>
    </Pressable>
  )

  const filterItems = (value) => {
    let newItems = items?.map((item) => {
      if (item.name) {
        item.hidden = !item.name.toLowerCase().includes(value.toLowerCase())
      }

      return item
    })

    const ipv4Pattern = /^(\d{1,3}\.){0,3}\d{0,3}$/
    const ip_form = ipv4Pattern.test(value)

    let newDevices = devices?.map((device) => {
      if (ip_form) {
        device.hidden = !device.RecentIP.includes(value.toLowerCase())
      } else if (device.Name) {
        device.hidden = !device.Name.toLowerCase().includes(value.toLowerCase())
      } else {
        device.hidden = true
      }

      return device
    })

    setItems(newItems)
    setDevices(newDevices)
  }

  const onChangeText = (value) => {
    setFilterText(value)
    filterItems(value)
  }

  const onSubmitEditing = (value) => {
    //navigate if one or just pick first
    if (!items?.length) {
      return
    }

    let item = null
    for (let r of items) {
      if (r.redirect) continue
      if (r.views) {
        let found = false
        for (let rr of r.views) {
          if (!rr.hidden && rr.path) {
            item = rr
            found = true
            break
          }
        }

        if (found) break
      }

      if (!r.hidden && r.path) {
        item = r
        break
      }
    }

    if (item?.path) {
      return navigateItem(item)
    }

    // find device
    let device = devices.find((d) => !d.hidden)
    if (device) {
      return navigateDevice(device)
    }
  }

  const navigateDevice = (device) => {
    setIsOpen(false)
    navigate(`/admin/devices/${device.MAC || device.WGPubKey}`)
    setActiveSidebarItem('/admin/devices')

    setFilterText('')
    filterItems('')
  }

  //navigate and reset form
  const navigateItem = (item) => {
    setIsOpen(false)
    navigate(`/${item.layout || 'admin'}/${item.path}`)

    setActiveSidebarItem(item.path)

    setFilterText('')
    filterItems('')
  }

  const keyMap = { SHOW_SEARCH: 'shift+/' }
  const handlers = { SHOW_SEARCH: () => onPress() }

  if (Platform.OS != 'web') {
    return <></>
  }

  //uses app context  cache

  const isDeviceMatch =
    devices.map((d) => d.hidden).filter((hidden) => !hidden).length > 0

  return (
    <>
      <GlobalHotKeys keyMap={keyMap} handlers={handlers} />

      <Popover
        placement="bottom left"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
        initialFocusRef={refInput}
        offset={-44}
        display={isOpen ? 'flex' : 'none'}
      >
        <PopoverContent w={280}>
          <PopoverBody>
            {/*<PopoverCloseButton>
              <Icon as={CloseIcon} />
            </PopoverCloseButton>*/}
            <VStack space="md">
              <FormControl>
                <Input size="sm" rounded="$md" w={250}>
                  <InputSlot pl="$3">
                    <InputIcon as={SearchIcon} />
                  </InputSlot>
                  <InputField
                    ref={refInput}
                    autoFocus={true}
                    value={filterText}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmitEditing}
                    placeholder="Jump to section"
                  />
                  <InputSlot mr="$3.5">
                    <Text size="xs">⏎</Text>
                  </InputSlot>
                </Input>
              </FormControl>
              <ScrollView maxHeight={520} showsVerticalScrollIndicator={false}>
                <VStack space="sm" justifyContent="flex-start">
                  {items.map((item) => (
                    <Pressable
                      key={`${item.name}:${item.hidden}`}
                      onPress={() => navigateItem(item)}
                      display={item.hidden ? 'none' : 'flex'}
                      borderWidth="$1"
                      borderColor="$primary200"
                      px="$4"
                      py="$2"
                      rounded="$md"
                      sx={{
                        ':hover': { borderColor: '$primary400' },
                        _dark: {
                          borderColor: '$coolGray600',
                          ':hover': { borderColor: '$coolGray700' }
                        }
                      }}
                    >
                      <HStack>
                        <Icon as={item.icon} mr="$2" size="md" />
                        <Text size="sm">{item.name}</Text>
                      </HStack>
                    </Pressable>
                  ))}

                  <HStack display={isDeviceMatch ? 'flex' : 'none'}>
                    <Text bold size="xs">
                      Devices
                    </Text>
                  </HStack>

                  {devices.map((device) => (
                    <Pressable
                      key={`${device.Name}:${device.RecentIP}`}
                      onPress={() => navigateDevice(device)}
                      display={device.hidden ? 'none' : 'flex'}
                      borderWidth="$1"
                      borderColor="$primary200"
                      px="$4"
                      py="$2"
                      rounded="$md"
                      sx={{
                        ':hover': { borderColor: '$primary400' },
                        _dark: {
                          borderColor: '$coolGray600',
                          ':hover': { borderColor: '$coolGray700' }
                        }
                      }}
                    >
                      <HStack justifyContent="space-between">
                        <Text size="sm">{device.Name}</Text>
                        <Text bold size="sm">
                          {device.RecentIP}
                        </Text>
                      </HStack>
                    </Pressable>
                  ))}
                </VStack>
              </ScrollView>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  )
}

export default RouteJump
