import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AlertContext, ModalContext } from 'AppContext'
import { deviceAPI, wifiAPI } from 'api'
import ModalConfirm from 'components/ModalConfirm'
import DeviceQRCode from './DeviceQRCode'
import { Tooltip } from 'components/Tooltip'
import { prettyDate } from 'utils'

import {
  Button,
  ButtonIcon,
  Box,
  Icon,
  Input,
  InputField,
  HStack,
  VStack,
  Text,
  Menu,
  MenuItem,
  MenuItemLabel,
  Pressable,
  useColorMode,
  CircleIcon,
  CopyIcon,
  TrashIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import { Address4 } from 'ip-address'

import { TagItem, GroupItem, PolicyItem } from 'components/TagItem'
import IconItem from 'components/IconItem'
import {
  EyeIcon,
  PencilIcon,
  WaypointsIcon,
  WifiIcon
} from 'lucide-react-native'

const DeviceIcon = ({ icon, color: _color, isConnected, ...props }) => {
  let color = _color ? `$${_color}400` : '$blueGray400'
  let opacity = isConnected ? 1 : 0.65
  let borderColor = isConnected ? '$green600' : '$muted500'

  return (
    <Box
      bg="$white"
      display="none"
      sx={{
        '@md': {
          display: 'flex'
        },
        _dark: { bg: '$blueGray700' }
      }}
      p="$4"
      rounded="$full"
      opacity={opacity}
      borderColor={borderColor}
      borderWidth={1}
    >
      <IconItem name={icon} color={color} size={32} />
    </Box>
  )
}

const DeviceInfo = ({ identity, ...props }) => {
  const [ssids, setSsids] = useState([])
  const [device, setDevice] = useState(null)
  const [showPassword, setShowPassword] = useState(true)

  //TODO fetch from otp'd /device?identity=device.MAC

  useEffect(() => {
    //TODO check valid mac
    if (!identity) {
      return
    }

    deviceAPI
      .getDevice(identity)
      .then((device) => {
        setDevice(device)
      })
      .catch((err) => {
        console.error('API Error:', err)
      })
  }, [identity])

  useEffect(() => {
    // fetch ap name
    wifiAPI
      .interfaces('AP')
      .then((ifaces) => {
        Promise.all(
          ifaces.map((iface) => {
            return wifiAPI.status(iface).then((status) => {
              return status['ssid[0]']
            })
          })
        ).then((ssids) => {
          setSsids(ssids)
        })
      })
      .catch((err) => {
        //ERR
      })
  }, [])

  if (!device) {
    return <Text>....{identity}</Text>
  }

  return ssids.map((ssid) => (
    <VStack key={ssid} space="md">
      <VStack space="xs" alignItems="center">
        <Text size="md" bold>
          SSID
        </Text>
        <Text size="md">{ssid}</Text>
      </VStack>
      <VStack space="xs" alignItems="center">
        <Text size="md" bold>
          Password
        </Text>
        <Tooltip label="Toggle password">
          <Pressable onPress={() => setShowPassword(!showPassword)}>
            <Text size="md">
              {showPassword ? device.PSKEntry.Psk : '*'.repeat(12)}
            </Text>
          </Pressable>
        </Tooltip>
      </VStack>
      <HStack justifyContent="center">
        <DeviceQRCode ssid={ssid} psk={device.PSKEntry.Psk} type="WPA" />
      </HStack>
    </VStack>
  ))
}

const Device = React.memo(({ device, showMenu, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
  const [ip, setIP] = useState(device.RecentIP)
  const [policies, setPolicies] = useState(device.Policies?.sort() || [])
  const [groups, setGroups] = useState(device.Groups.sort())
  const [tags, setTags] = useState(device.DeviceTags.sort())
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const navigate = useNavigate()

  const defaultPolicies = props.policies || ['wan', 'dns', 'lan', 'lan_upstream']
  const defaultGroups = props.groups || []
  const defaultTags = props.tags || []

  const handleGroups = (groups) => {
    if (!device.MAC && !device.WGPubKey) {
      return
    }

    setGroups([...new Set(groups.filter((v) => typeof v === 'string'))])

    deviceAPI
      .updateGroups(device.MAC || device.WGPubKey, groups)
      .catch((error) =>
        this.context.error('[API] updateDevice error: ' + error.message)
      )
  }

  const handlePolicies = (policies) => {
    if (!device.MAC && !device.WGPubKey) {
      return
    }

    setPolicies([...new Set(policies.filter((v) => typeof v === 'string'))])

    deviceAPI
      .updatePolicies(device.MAC || device.WGPubKey, policies)
      .catch((error) =>
        this.context.error('[API] updateDevice error: ' + error.message)
      )
  }

  const handleTags = (tags) => {
    if (!device.MAC && !device.WGPubKey) {
      return
    }

    setTags([...new Set(tags.filter((v) => typeof v === 'string'))])

    deviceAPI
      .updateTags(device.MAC || device.WGPubKey, tags)
      .catch((error) =>
        context.error('[API] updateDevice error: ' + error.message)
      )
  }

  const handleName = (name) => {
    setName(name)
    setEditing(name != device.Name)
  }

  function toLong(ipAddress) {
    return ipAddress.parsedAddress.reduce(
      (accumulator, octet) => (accumulator << 8) + Number(octet),
      0
    )
  }

  function fromLong(long) {
    return [
      (long >>> 24) & 0xff,
      (long >>> 16) & 0xff,
      (long >>> 8) & 0xff,
      long & 0xff
    ].join('.')
  }

  function makeTinyAddress(ipAddress) {
    let subnet
    let address
    try {
      address = new Address4(ipAddress)
      subnet = new Address4(address.startAddress().address + '/30')
    } catch {
      return ipAddress
    }

    return fromLong(toLong(subnet.startAddress()) + 2)
  }

  const handleIP = (ip) => {
    //transform ip into a tinynet address , and notify
    let new_ip = makeTinyAddress(ip)
    if (ip != new_ip) {
      context.info(
        'SPR Micro-Segmentation Uses /30 network IP assignments, forcing IP to device IP'
      )
      ip = new_ip
    }
    setIP(ip)
    setEditing(ip != device.RecentIP)
  }

  let protocolAuth = { sae: 'WPA3', wpa2: 'WPA2' }
  let wifi_type = protocolAuth[device.PSKEntry.Type] || 'N/A'

  const removeDevice = () => {
    let id = device.MAC || device.WGPubKey || 'pending'

    deviceAPI
      .deleteDevice(id)
      .then(notifyChange)
      .catch((error) =>
        context.error('[API] deleteDevice error: ' + error.message)
      )
  }

  const duplicateDevice = () => {
    // this will copy psk from source device

    let data = {
      MAC: 'pending',
      Name: `${device.Name} #copy`,
      Groups: groups
    }

    deviceAPI
      .copy(device.MAC, data)
      .then((res) => {
        context.success(
          'Device copied',
          `${device.Name} copy saved as ${data.Name}`
        )
        notifyChange()
      })
      .catch((error) => {
        context.error('Failed to duplicate device', error)
      })
  }

  const saveDevice = async () => {
    let id = device.MAC || device.WGPubKey
    if (!name) {
      return
    }

    if (name != device.Name) {
      deviceAPI
        .updateName(id, name)
        .then(notifyChange)
        .catch((error) =>
          context.error('[API] updateName error: ' + error.message)
        )
    }

    if (ip != device.RecentIP) {
      deviceAPI
        .updateIP(id, ip)
        .then(notifyChange)
        .catch((error) =>
          context.error(
            '[API] updateIP error: ' +
              error.message +
              '. IP not in range or not a valid Supernetwork Device IP'
          )
        )
    }
  }

  const handleSubmit = () => {
    setEditing(false)
    saveDevice()
  }

  const handleSubmitNew = (value) => {
    if (modalType.match(/Group/i)) {
      handleGroups(groups.concat(value))
    } else if (modalType.match(/Policy/i)) {
      handlePolicies(policies.concat(value))
    } else if (modalType.match(/Tag/i)) {
      handleTags(tags.concat(value))
    }
  }

  /*
  let colors = [
    'violet',
    'fuchsia',
    'purple',
    'pink',
    'tertiary',
    'teal',
    'cyan',
    'blueGray',
    'dark',
    'amber'
  ]

  let idx = (device.Name.charCodeAt(0) || 0) % colors.length
  */

  const trigger = (triggerProps) => (
    <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted500" />
    </Button>
  )

  const deviceURL = (device) =>
    `/admin/devices/${device.MAC || encodeURIComponent(device.WGPubKey)}`

  const moreMenu = (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'edit') {
          if (device.MAC == 'pending') {
            context.warning(
              `Device is pending`,
              `Wait for device to connect or add a new one`
            )
          } else {
            navigate(deviceURL(device))
          }
        } else if (key == 'duplicate') {
          duplicateDevice()
        } else if (key == 'delete') {
          removeDevice()
        } else if (key == 'info') {
          modalContext.modal('', <DeviceInfo identity={device.MAC} />)
        }
      }}
    >
      <MenuItem key="edit">
        <Icon as={PencilIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Edit</MenuItemLabel>
      </MenuItem>
      <MenuItem key="duplicate">
        <Icon as={CopyIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Duplicate</MenuItemLabel>
      </MenuItem>
      <MenuItem key="info">
        <Icon as={WifiIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Show password</MenuItemLabel>
      </MenuItem>
      <MenuItem key="delete">
        <Icon as={TrashIcon} color="$red700" mr="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  const getDates = (device) => {
    let res = ''

    if (device.DHCPFirstTime) {
      res += `First DHCP: ${prettyDate(device.DHCPFirstTime)}`
    }

    if (device.DHCPLastTime) {
      res +=
        (res.length ? '. ' : '') +
        `Last DHCP: ${prettyDate(device.DHCPLastTime)}`
    }

    return res
  }

  const inlineEdit = false
  const colorMode = useColorMode()

  return (
    <Pressable
      onPress={() => navigate(deviceURL(device))}
      disabled={device.MAC == 'pending'}
    >
      <HStack
        key={device.MAC}
        bg="$backgroundCardLight"
        borderColor="$coolGray200"
        p="$4"
        my="$1"
        mx="$0"
        sx={{
          '@md': {
            flexDirection: 'row',
            my: '$2',
            mx: '$4',
            rounded: '$md',
            shadow: '$md'
          },
          _dark: { bg: '$backgroundCardDark', borderColor: '$muted700' }
        }}
        space="md"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={0}
        minH={120}
      >
        <VStack
          sx={{ '@md': { flexDirection: 'row' } }}
          space="md"
          flex={1}
          justifyContent="space-between"
          w="$full"
        >
          {Platform.OS == 'web' ? (
            <DeviceIcon
              icon={device.Style?.Icon || 'Laptop'}
              color={device.Style?.Color}
              isConnected={device.isConnected}
            />
          ) : null}

          <VStack
            space="md"
            justifyContent="space-between"
            sx={{ '@md': { flexDirection: 'row', w: '$1/3' } }}
          >
            <Tooltip label={getDates(device) || 'No DHCP'}>
              <VStack
                justifyContent="flex-end"
                sx={{ '@md': { justifyContent: 'center' } }}
              >
                <Text bold>{device.Name || 'N/A'}</Text>
                <Text size="sm" color="$muted500" maxWidth={180} isTruncated>
                  {device.oui || ' '}
                </Text>
              </VStack>
            </Tooltip>

            <VStack
              sx={{
                '@md': { justifyContent: 'center', alignItems: 'flex-end' }
              }}
            >
              {inlineEdit ? (
                <Input size="lg" variant="underlined" w="100%">
                  <InputField
                    type="text"
                    value={ip}
                    autoFocus={false}
                    onChangeText={(value) => handleIP(value)}
                    onSubmitEditing={handleSubmit}
                  />
                </Input>
              ) : (
                <HStack space="sm" alignItems="center">
                  <Text size="md" bold>
                    {ip}
                  </Text>
                  <Box sx={{ '@md': { display: 'none' } }}>
                    <Icon
                      as={device.MAC ? WifiIcon : WaypointsIcon}
                      size="sm"
                      color={
                        device.isConnected
                          ? '$green600'
                          : colorMode == 'light'
                          ? '$muted200'
                          : '$muted700'
                      }
                    />
                  </Box>
                </HStack>
              )}

              <Text size="sm" color="$muted500">
                {device.MAC || ' '}
              </Text>

              {device.VLANTag?.length ? (
                <HStack space="sm">
                  <Text>VLAN</Text>
                  <Text bold>{device.VLANTag}</Text>
                </HStack>
              ) : null}
            </VStack>
          </VStack>

          <VStack
            display="none"
            sx={{
              '@md': {
                display: 'flex',
                w: '8%'
              }
            }}
            justifyContent="center"
            alignItems="center"
          >
            <Text size="sm">{wifi_type}</Text>
          </VStack>
          <HStack
            space="sm"
            justifyContent="flex-start"
            flexWrap="wrap"
            alignItems="flex-start"
            sx={{ '@md': { w: '$2/5', alignSelf: 'center' } }}
          >
          {policies.map((policy) => (
              <PolicyItem key={policy} name={policy} />
            ))}

            {groups.map((group) => (
              <GroupItem key={group} name={group} />
            ))}

            {tags.map((tag) => (
              <TagItem key={tag} name={tag} />
            ))}
          </HStack>
        </VStack>
        {showMenu ? moreMenu : null}
      </HStack>
      <ModalConfirm
        type={modalType}
        onSubmit={handleSubmitNew}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </Pressable>
  )
})

Device.propTypes = {
  device: PropTypes.object.isRequired,
  showMenu: PropTypes.bool,
  groups: PropTypes.array,
  tags: PropTypes.array,
  policies: PropTypes.array
}

export default Device
