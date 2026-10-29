import React, {
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from 'AppContext'
import { firewallAPI } from 'api'
import { normalizeTextInput } from 'utils/normalizeTextInput'

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

import { ContainerIcon, SearchIcon, SlashIcon } from 'lucide-react-native'

import { GlobalHotKeys, HotKeys } from 'react-hotkeys'
import { Platform } from 'react-native'

const keyMap = { SHOW_SEARCH: 'shift+/' }

const ipv4Pattern = /^(\d{1,3}\.){0,3}\d{0,3}$/

const interfacesTab = 'Custom Interface Access'

const rowSx = {
  ':hover': { borderColor: '$primary400' },
  _dark: {
    borderColor: '$coolGray600',
    ':hover': { borderColor: '$coolGray700' }
  }
}

const parseIP = (ip) => (ip || '').split('.').map(Number)

const sortDevices = (a, b) => {
  const aIP = parseIP(a.RecentIP)
  const bIP = parseIP(b.RecentIP)

  for (let i = 0; i <= 4; i++) {
    if (aIP[i] !== bIP[i]) {
      return aIP[i] - bIP[i]
    }
  }

  return 0
}

const flattenRoutes = (routes) =>
  routes.flatMap((r) => {
    if (r.layout == 'auth' || r.redirect || r.hidden) return []

    if (r.views) {
      return r.views
        .filter((rr) => !rr.redirect && !rr.hidden)
        .map((rr) => ({ name: rr.name, path: rr.path, icon: rr.icon }))
    }

    return [{ name: r.name, path: r.path, icon: r.icon }]
  })

const macQuery = (value) => {
  const mac = value.replace(/-/g, ':')
  if (/^[0-9a-f]{0,2}(:[0-9a-f]{0,2})+$/.test(mac)) {
    return { mac, compact: false }
  }
  if (/^[0-9a-f]{4,12}$/.test(mac)) {
    return { mac, compact: true }
  }
  return null
}

const matchMAC = (MAC, query) => {
  if (!query || !MAC) return false
  const mac = MAC.toLowerCase()
  return (query.compact ? mac.replace(/:/g, '') : mac).includes(query.mac)
}

const matchItem = (item, value) =>
  !item.name || item.name.toLowerCase().includes(value)

const matchDevice = (device, value, isIP, mac) => {
  if (matchMAC(device.MAC, mac)) {
    return true
  }

  if (isIP) {
    return (device.RecentIP || '').includes(value)
  }

  return !!device.Name && device.Name.toLowerCase().includes(value)
}

const matchInterface = (rule, value, isIP) => {
  if (isIP) {
    return (rule.SrcIP || '').includes(value)
  }

  return [rule.Interface, rule.RuleName].some(
    (name) => !!name && name.toLowerCase().includes(value)
  )
}

export const searchJump = ({ items, devices, interfaces }, query) => {
  const value = query.toLowerCase()
  const isIP = ipv4Pattern.test(value)
  const mac = macQuery(value)

  return {
    items: items.filter((item) => matchItem(item, value)),
    devices: devices.filter((device) => matchDevice(device, value, isIP, mac)),
    interfaces: interfaces.filter((rule) => matchInterface(rule, value, isIP)),
    isMAC: !!mac
  }
}

const RouteRow = memo(({ item, onPress }) => (
  <Pressable
    onPress={() => onPress(item)}
    borderWidth="$1"
    borderColor="$primary200"
    px="$4"
    py="$2"
    rounded="$md"
    sx={rowSx}
  >
    <HStack>
      <Icon as={item.icon} mr="$2" size={18} />
      <Text size="sm">{item.name}</Text>
    </HStack>
  </Pressable>
))

const DeviceRow = memo(({ device, showMAC, onPress }) => (
  <Pressable
    onPress={() => onPress(device)}
    borderWidth="$1"
    borderColor="$primary200"
    px="$4"
    py="$2"
    rounded="$md"
    sx={rowSx}
  >
    <HStack justifyContent="space-between">
      <Text size="sm">{device.Name}</Text>
      <Text bold size="sm">
        {device.RecentIP}
      </Text>
    </HStack>
    {showMAC ? (
      <Text size="xs" color="$muted500">
        {device.MAC}
      </Text>
    ) : null}
  </Pressable>
))

const InterfaceRow = memo(({ rule, onPress }) => (
  <Pressable
    onPress={() => onPress(rule)}
    borderWidth="$1"
    borderColor="$primary200"
    px="$4"
    py="$2"
    rounded="$md"
    sx={rowSx}
  >
    <HStack justifyContent="space-between">
      <HStack>
        <Icon as={ContainerIcon} mr="$2" size={18} />
        <Text size="sm">{rule.Interface}</Text>
      </HStack>
      <Text bold size="sm">
        {rule.SrcIP}
      </Text>
    </HStack>
  </Pressable>
))

const RouteJump = ({ ...props }) => {
  const {
    activeSidebarItem,
    setActiveSidebarItem,
    getDevices,
    routes = []
  } = useContext(AppContext)
  const [isOpen, setIsOpen] = useState(false)
  const [devices, setDevices] = useState([])
  const [interfaces, setInterfaces] = useState([])
  const [filterText, setFilterText] = useState('')
  const query = useDeferredValue(filterText)
  const navigate = useNavigate()

  const refInput = React.useRef(null)

  const items = useMemo(() => flattenRoutes(routes), [routes])

  useEffect(() => {
    getDevices()
      .then((d) => {
        setDevices([...d].sort(sortDevices))
      })
      .catch(() => {})
  }, [routes])

  const matches = useMemo(
    () => searchJump({ items, devices, interfaces }, query),
    [items, devices, interfaces, query]
  )

  const onPress = useCallback(() => {
    setIsOpen(true)
    refInput.current?.focus()

    firewallAPI
      .config()
      .then((config) => {
        setInterfaces(config?.CustomInterfaceRules || [])
      })
      .catch(() => {})
  }, [])

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

  const onChangeText = (value) => {
    setFilterText(normalizeTextInput(value))
  }

  const navigateDevice = useCallback(
    (device) => {
      setIsOpen(false)
      navigate(`/admin/devices/${device.MAC || device.WGPubKey}`)
      setActiveSidebarItem('/admin/devices')

      setFilterText('')
    },
    [navigate, setActiveSidebarItem]
  )

  const navigateItem = useCallback(
    (item) => {
      setIsOpen(false)
      navigate(`/${item.layout || 'admin'}/${item.path}`)

      setActiveSidebarItem(item.path)

      setFilterText('')
    },
    [navigate, setActiveSidebarItem]
  )

  const navigateInterface = useCallback(
    (rule) => {
      setIsOpen(false)
      navigate(`/admin/firewall?tab=${encodeURIComponent(interfacesTab)}`)
      setActiveSidebarItem('firewall')

      setFilterText('')
    },
    [navigate, setActiveSidebarItem]
  )

  const onSubmitEditing = () => {
    const found = searchJump({ items, devices, interfaces }, filterText)

    const item = found.items.find((r) => r.path)
    if (item) {
      return navigateItem(item)
    }

    if (found.devices.length) {
      return navigateDevice(found.devices[0])
    }

    if (found.interfaces.length) {
      return navigateInterface(found.interfaces[0])
    }
  }

  const handlers = useMemo(() => ({ SHOW_SEARCH: () => onPress() }), [onPress])

  if (Platform.OS != 'web') {
    return <></>
  }

  return (
    <>
      <GlobalHotKeys keyMap={keyMap} handlers={handlers} />

      <Popover
        placement="bottom left"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
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
                  {matches.items.map((item) => (
                    <RouteRow
                      key={`${item.name}:${item.path}`}
                      item={item}
                      onPress={navigateItem}
                    />
                  ))}

                  {matches.devices.length ? (
                    <HStack>
                      <Text bold size="xs">
                        Devices
                      </Text>
                    </HStack>
                  ) : null}

                  {matches.devices.map((device) => (
                    <DeviceRow
                      key={
                        device.MAC ||
                        device.WGPubKey ||
                        `${device.Name}:${device.RecentIP}`
                      }
                      device={device}
                      showMAC={matches.isMAC}
                      onPress={navigateDevice}
                    />
                  ))}

                  {matches.interfaces.length ? (
                    <HStack>
                      <Text bold size="xs">
                        Container Interfaces
                      </Text>
                    </HStack>
                  ) : null}

                  {matches.interfaces.map((rule) => (
                    <InterfaceRow
                      key={`${rule.RuleName}:${rule.Interface}:${rule.SrcIP}`}
                      rule={rule}
                      onPress={navigateInterface}
                    />
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
