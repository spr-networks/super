import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AlertContext, ModalContext } from 'AppContext'
import { deviceAPI, wifiAPI } from 'api'
import DeviceQRCode from './DeviceQRCode'
import { Tooltip } from 'components/Tooltip'
import { prettyDate } from 'utils'

import {
  Button,
  ButtonIcon,
  Box,
  Icon,
  HStack,
  VStack,
  Text,
  Menu,
  MenuItem,
  MenuItemLabel,
  Pressable,
  useColorMode,
  CopyIcon,
  TrashIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import { TagItem, GroupItem, PolicyItem } from 'components/TagItem'
import IconItem from 'components/IconItem'
import { PencilIcon, WaypointsIcon, WifiIcon } from 'lucide-react-native'

const DeviceIcon = ({
  icon,
  color: _color,
  isConnected,
  isAssociatedOnly,
  ...props
}) => {
  let color = _color ? `$${_color}400` : '$blueGray400'
  let opacity = isConnected ? 1 : 0.4
  let borderColor = isConnected
    ? '$green600'
    : isAssociatedOnly
    ? '$yellow400'
    : '$muted500'
  //return <IconItem name={icon} color={color} size={32} />

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
      p="$3"
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

const Device = React.memo(({ device, notifyChange, showMenu, ...props }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  let protocolAuth = { sae: 'WPA3', wpa2: 'WPA2' }
  let wifi_type = protocolAuth[device.PSKEntry.Type] || 'Wired'

  //NOTE dup code, same in view for deleteListItem
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
      Groups: device.Groups?.sort() || [],
      DeviceTags: device.DeviceTags?.sort() || []
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

  const getConnectedColor = (device) => {
    if (device.isConnected) {
      return '$green600'
    }
    if (colorMode == 'light') {
      return '$muted300'
    }
    return '$muted700'
  }

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
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={0}
        minH={120}
      >
        <VStack
          flex={1}
          space="md"
          justifyContent="space-between"
          sx={{
            '@md': { flexDirection: 'row', gap: '$8', alignItems: 'center' }
          }}
        >
          <VStack
            space="md"
            justifyContent="space-between"
            sx={{ '@md': { flexDirection: 'row', gap: '$4', flex: 1 } }}
          >
            <DeviceIcon
              icon={device.Style?.Icon || 'Laptop'}
              color={device.Style?.Color}
              isConnected={device.isConnected}
              isAssociatedOnly={device.isAssociatedOnly}
            />
            <VStack
              flex={1}
              justifyContent="flex-end"
              sx={{ '@md': { justifyContent: 'center' } }}
            >
              <Tooltip label={getDates(device) || 'No DHCP'}>
                <Text bold>{device.Name || 'N/A'}</Text>
                <Text
                  size="sm"
                  color="$muted500"
                  maxWidth={280}
                  h="$5"
                  isTruncated
                >
                  {device.oui || ' '}
                </Text>
              </Tooltip>
            </VStack>

            <VStack
              sx={{
                '@md': { justifyContent: 'center', alignItems: 'flex-end' }
              }}
            >
              <HStack space="sm" alignItems="center">
                <Tooltip label={wifi_type}>
                  <IconItem
                    name={wifi_type == 'Wired' ? 'Wire' : 'Wifi'}
                    size={16}
                    sx={{
                      '@md': {
                        display: 'none'
                      }
                    }}
                    color={getConnectedColor(device)}
                  />
                </Tooltip>

                <Text size="md" bold>
                  {device.RecentIP}
                </Text>
              </HStack>

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
            <Tooltip label={wifi_type}>
              <IconItem
                name={wifi_type == 'Wired' ? 'Wire' : 'Wifi'}
                size={32}
              />
            </Tooltip>
          </VStack>

          <HStack
            space="sm"
            justifyContent="flex-start"
            flexWrap="wrap"
            alignItems="flex-start"
            sx={{ '@md': { flex: 1, alignSelf: 'center' } }}
          >
            {device.Policies?.sort().map((policy) => (
              <PolicyItem key={policy} name={policy} />
            ))}

            {device.Groups?.sort().map((group) => (
              <GroupItem key={group} name={group} />
            ))}

            {device.DeviceTags?.sort().map((tag) => (
              <TagItem key={tag} name={tag} />
            ))}
          </HStack>
        </VStack>
        {showMenu ? moreMenu : null}
      </HStack>
    </Pressable>
  )
})

Device.propTypes = {
  device: PropTypes.object.isRequired,
  notifyChange: PropTypes.func.isRequired,
  showMenu: PropTypes.bool
}

export default Device
