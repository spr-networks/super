import React, { useContext, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import ModalConfirm from 'components/ModalConfirm'
import { prettyDate } from 'utils'

import Icon from 'FontAwesomeUtils'
import {
  faEllipsis,
  faObjectGroup,
  faTrash,
  faEarth,
  faCircleNodes,
  faNetworkWired,
  faTag,
  faCopy,
  faPen,
  faWifi
} from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Box,
  IconButton,
  Input,
  Menu,
  Stack,
  HStack,
  VStack,
  Text,
  Tooltip,
  useColorModeValue
} from 'native-base'

import { Address4 } from 'ip-address'

import IconItem from 'components/IconItem'

const GroupItem = React.memo(({ name }) => {
  let groupIcons = {
    wan: faCircleNodes,
    dns: faEarth,
    lan: faNetworkWired
  }

  let groupColors = {
    dns: useColorModeValue('muted.500', 'blueGray.700'), //'orange.400',
    lan: useColorModeValue('muted.400', 'blueGray.600'), //'violet.600',
    wan: useColorModeValue('muted.500', 'blueGray.700') //'cyan.500'
  }

  let icon = groupIcons[name] || faObjectGroup
  let bg = groupColors[name] || 'muted.600'

  return (
    <Badge
      key={name}
      variant="solid"
      colorScheme="muted"
      bg={bg}
      leftIcon={<Icon icon={icon} size={3} />}
      rounded="sm"
      size="sm"
      py={1}
      px={2}
    >
      {name}
    </Badge>
  )
})

const TagItem = React.memo(({ name }) => {
  let tagIcons = {
    wan: faCircleNodes,
    dns: faEarth,
    lan: faNetworkWired
  }

  let icon = faTag
  return (
    <Badge
      key={name}
      variant="outline"
      colorScheme={useColorModeValue('muted', 'blueGray')}
      leftIcon={<Icon icon={icon} size={3} />}
      rounded="sm"
      size="sm"
      py={1}
      px={2}
    >
      {name}
    </Badge>
  )
})

const DeviceIcon = ({ icon, color, isConnected, ...props }) => {
  let _color = color ? `${color}.400` : 'blueGray.400'
  let opacity = isConnected ? 1 : 0.65
  let borderColor = isConnected
    ? 'green.600'
    : useColorModeValue('muted.200', 'muted.700')

  return (
    <Box
      display={{ base: 'none', md: 'flex' }}
      bg="white"
      _dark={{ bg: 'blueGray.700' }}
      p={4}
      rounded="full"
      opacity={opacity}
      borderColor={borderColor}
      borderWidth={1}
    >
      <IconItem name={icon} color={_color} size={8} />
    </Box>
  )
}

const Device = React.memo(({ device, showMenu, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
  const [ip, setIP] = useState(device.RecentIP)
  const [groups, setGroups] = useState(device.Groups.sort())
  const [tags, setTags] = useState(device.DeviceTags.sort())
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const navigate = useNavigate()

  const defaultGroups = props.groups || ['wan', 'dns', 'lan']
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
    } else {
      handleTags(tags.concat(value))
    }
  }

  let colors = [
    'violet',
    'pink',
    'tertiary',
    'rose',
    'fuchsia',
    'purple',
    'cyan',
    'teal',
    'emerald'
  ]

  let idx = (device.Name.charCodeAt(0) || 0) % colors.length

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.Group title="Actions">
        <Menu.Item
          onPress={() =>
            navigate(
              `/admin/devices/${
                device.MAC || encodeURIComponent(device.WGPubKey)
              }`
            )
          }
        >
          <HStack space={2} alignItems="center">
            <Icon icon={faPen} color="muted.500" />
            <Text>Edit</Text>
          </HStack>
        </Menu.Item>

        <Menu.Item onPress={duplicateDevice}>
          <HStack space={2} alignItems="center">
            <Icon icon={faCopy} color="muted.500" />
            <Text>Duplicate</Text>
          </HStack>
        </Menu.Item>
        <Menu.Item onPress={removeDevice}>
          <HStack space={2} alignItems="center">
            <Icon icon={faTrash} color="danger.700" />
            <Text color="danger.700">Delete</Text>
          </HStack>
        </Menu.Item>
      </Menu.Group>
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

  return (
    <>
      <Stack
        direction={{ base: 'row', md: 'row' }}
        space={2}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        p={4}
        my={{ base: 1, md: 2 }}
        mx={{ base: 0, md: 4 }}
        rounded={{ md: 'md' }}
        shadow={{ md: 'md' }}
        key={device.MAC}
        justifyContent="space-between"
        alignItems="center"
        _light={{ borderColor: 'coolGray.200' }}
        _dark={{ borderColor: 'muted.700' }}
        borderBottomWidth={0}
        minH={120}
      >
        <Stack
          direction={{ base: 'column', md: 'row' }}
          space={2}
          flex={1}
          justifyContent="space-between"
          __alignItems="center"
          w="full"
        >
          {Platform.OS == 'web' ? (
            <DeviceIcon
              icon={device.Style?.Icon || 'Laptop'}
              color={device.Style?.Color}
              isConnected={device.isConnected}
            />
          ) : null}

          <Stack
            w={{ md: '1/3' }}
            justifyContent={'space-between'}
            direction={{ base: 'row', md: 'row' }}
          >
            <Tooltip label={getDates(device)} isDisabled={!getDates(device)}>
              <VStack
                __w={{ md: '20%' }}
                justifyContent={{ base: 'flex-end', md: 'center' }}
              >
                {inlineEdit ? (
                  <Input
                    size="lg"
                    type="text"
                    variant="underlined"
                    w="100%"
                    value={name}
                    autoFocus={false}
                    onChangeText={(value) => handleName(value)}
                    onSubmitEditing={handleSubmit}
                  />
                ) : (
                  <Text bold>{device.Name || 'N/A'}</Text>
                )}

                <Text color="muted.500" isTruncated maxW={150}>
                  {device.oui || ' '}
                </Text>
              </VStack>
            </Tooltip>

            <VStack
              __w={{ md: '12%' }}
              justifyContent={{ base: 'flex-end', md: 'center' }}
              alignItems={'flex-end'}
            >
              {inlineEdit ? (
                <Input
                  size="lg"
                  type="text"
                  variant="underlined"
                  w="100%"
                  value={ip}
                  autoFocus={false}
                  onChangeText={(value) => handleIP(value)}
                  onSubmitEditing={handleSubmit}
                />
              ) : (
                <HStack space={2} alignItems={'center'}>
                  <Box display={{ base: 'flex', md: 'none' }}>
                    <Icon
                      icon={device.MAC ? faWifi : faCircleNodes}
                      size={3}
                      color={
                        device.isConnected
                          ? 'green.600'
                          : useColorModeValue('muted.200', 'muted.700')
                      }
                    />
                  </Box>

                  <Text bold>{ip}</Text>
                </HStack>
              )}

              <Text color="muted.500">{device.MAC || ' '}</Text>

              {device.VLANTag?.length ? (
                <HStack space={1}>
                  <Text>VLAN</Text>
                  <Text bold>{device.VLANTag}</Text>
                </HStack>
              ) : null}
            </VStack>
          </Stack>

          <Stack
            w={{ base: '100%', md: '8%' }}
            display={{ base: 'none', md: 'flex' }}
            justifyContent="center"
            alignItems={'center'}
          >
            <Text>{wifi_type}</Text>
          </Stack>
          <HStack
            w={{ base: '100%', md: '40%' }}
            space={2}
            alignSelf="center"
            alignItems="center"
            justifyContent={{ base: 'flex-start', md: 'flex-start' }}
            flexWrap="wrap"
          >
            {groups.map((group) => (
              <GroupItem key={group} name={group} />
            ))}

            {tags.map((tag) => (
              <TagItem key={tag} name={tag} />
            ))}
          </HStack>
        </Stack>
        {showMenu ? moreMenu : null}
      </Stack>
      <ModalConfirm
        type={modalType}
        onSubmit={handleSubmitNew}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </>
  )
})

Device.propTypes = {
  device: PropTypes.object.isRequired,
  showMenu: PropTypes.bool,
  groups: PropTypes.array,
  tags: PropTypes.array
}

export default Device
