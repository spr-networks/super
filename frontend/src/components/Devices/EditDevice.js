import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import ModalConfirm from 'components/ModalConfirm'

import Icon from 'FontAwesomeUtils'
import {
  faEllipsis,
  faEllipsisV,
  faLaptop,
  faMobileScreen,
  faObjectGroup,
  faTrash,
  faEarth,
  faCircleNodes,
  faNetworkWired,
  faTag,
  faCopy
} from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Button,
  Box,
  FormControl,
  Heading,
  IconButton,
  Input,
  Menu,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  ScrollView,
  Tooltip,
  useColorModeValue,
} from 'native-base'

import { Address4 } from 'ip-address'

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

const EditDevice = React.memo(({ device, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
  const [rawIP, setRawIP] = useState(device.RecentIP);
  const [ip, setIP] = useState(device.RecentIP)
  const [vlantag, setVlanTag] = useState(device.VLANTag)
  const [groups, setGroups] = useState(device.Groups.sort())
  const [tags, setTags] = useState(device.DeviceTags.sort())
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')

  // for adding
  const defaultGroups = props.groups || ['wan', 'dns', 'lan']
  const defaultTags = props.tags || []

  const handleGroups = (groups) => {
    if (!device.MAC && !device.WGPubKey) {
      return
    }

    setGroups([...new Set(groups.filter((v) => typeof v === 'string'))])

    deviceAPI
      .updateGroups(device.MAC || device.WGPubKey, groups)
      .then(notifyChange)
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

  const isPositiveNumber = (str) => {
    let num = parseFloat(str);
    return !isNaN(num) && num > 0;
  }

  const handleVLAN = (value) => {
    if (isPositiveNumber(value) || value == "") {
      setVlanTag(value)
      setEditing(value != device.VLANTag)
    }
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

  const handleIPImpl = (ip) => {
    //transform ip into a tinynet address , and notify
    let new_ip = makeTinyAddress(ip)
    if (ip != new_ip) {
      context.info(
        'SPR Micro-Segmentation Uses /30 network IP assignments, forcing IP to device IP'
      )
      ip = new_ip
    }
    setIP(ip)
    setRawIP(ip)
    setEditing(ip != device.RecentIP)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      handleIPImpl(rawIP);
    }, 1000);  // delay in milliseconds

    return () => clearTimeout(timer); // this will clear the timer in case inputValue changes within 2 seconds
  }, [rawIP]);



  const handleIP = (value) => {
    setRawIP(value);
  };

  let protocolAuth = { sae: 'WPA3', wpa2: 'WPA2' }
  let wifi_type = protocolAuth[device.PSKEntry.Type] || 'N/A'

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
              '. IP not in range or not a valid Supernetwork Device IP '
          )
        )
    }

    if (vlantag != device.VLANTag) {
      deviceAPI
        .updateVLANTag(id, vlantag)
        .then(notifyChange)
        .catch((error) =>
          context.error(
            '[API] update VLAN Tag error: ' +
              error.message
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

  // TODO
  let icon = faLaptop
  if (name.match(/iphone|mobile|android/i)) {
    icon = faMobileScreen
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
  let color = colors[idx]
  let iconColor = `${color}.400`
  let borderColor = device.isConnected
    ? 'green.600'
    : useColorModeValue('muted.100', 'muted.700')

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
      <Menu.OptionGroup
        title="Groups"
        type="checkbox"
        defaultValue={groups}
        onChange={handleGroups}
      >
        {[...new Set(defaultGroups.concat(groups))].map((group) => (
          <Menu.ItemOption key={group} value={group}>
            {group}
          </Menu.ItemOption>
        ))}
        <Menu.ItemOption
          key="newGroup"
          onPress={() => {
            setModalType('Group')
            setShowModal(true)
          }}
        >
          New Group...
        </Menu.ItemOption>
      </Menu.OptionGroup>
      <Menu.OptionGroup
        title="Tags"
        type="checkbox"
        defaultValue={tags}
        onChange={handleTags}
      >
        {[...new Set(defaultTags.concat(tags))].map((tag) => (
          <Menu.ItemOption key={tag} value={tag}>
            {tag}
          </Menu.ItemOption>
        ))}
        <Menu.ItemOption
          key="newTag"
          onPress={() => {
            setModalType('Tag')
            setShowModal(true)
          }}
        >
          New Tag...
        </Menu.ItemOption>
      </Menu.OptionGroup>
      {/*
      <Menu.Group title="Actions">
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
      */}
    </Menu>
  )

  return (
    <ScrollView space={2} width={['100%', '100%', '5/6']} h={'100%'}>
      <Stack space={4}>
        <Heading fontSize="md">Edit Device</Heading>
        <FormControl>
          <FormControl.Label>Name</FormControl.Label>

          <Input
            size="lg"
            type="text"
            w="100%"
            value={name}
            autoFocus={false}
            onChangeText={(value) => handleName(value)}
            onSubmitEditing={handleSubmit}
          />

          {device.oui !== undefined ? (
            <FormControl.HelperText>{device.oui}</FormControl.HelperText>
          ) : null}
        </FormControl>

        <FormControl>
          <Tooltip label={"Assign Micro Segmentation IP, every 4th ip from 2 (.2, .6, .10, .14, ...). Check the Supernetworks view to create new subnets"}>
            <FormControl.Label>IP address</FormControl.Label>
          </Tooltip>
          <Input
            size="lg"
            type="text"
            w="100%"
            value={rawIP}
            autoFocus={false}
            onChangeText={(value) => handleIP(value)}
            onSubmitEditing={handleSubmit}
          />
        </FormControl>

        <FormControl>
          <Tooltip label={"For Wired Devices on a Managed Port: Assign VLAN Tag ID "}>
            <FormControl.Label>
              VLAN Tag ID
            </FormControl.Label>
          </Tooltip>
          <Input
            size="lg"
            type="text"
            w="100%"
            value={vlantag}
            autoFocus={false}
            onChangeText={(value) => handleVLAN(value)}
            onSubmitEditing={handleSubmit}
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>
            {device.MAC ? 'MAC address' : 'WG Pubkey'}
          </FormControl.Label>
          <Text isTruncated>{device.MAC || device.WGPubKey}</Text>
        </FormControl>

        <FormControl display={device.MAC ? 'flex' : 'none'}>
          <FormControl.Label>WiFi Auth</FormControl.Label>
          <Text>{wifi_type}</Text>
        </FormControl>

        <FormControl>
          <FormControl.Label>Groups and Tags</FormControl.Label>
          <HStack flexWrap="wrap" w="full" space={2}>
            <HStack space={2} flexWrap="wrap">
              {groups.map((group) => (
                <GroupItem key={group} name={group} />
              ))}
            </HStack>
            <HStack space={2} flexWrap="wrap">
              {tags.map((tag) => (
                <TagItem key={tag} name={tag} />
              ))}
            </HStack>
            <HStack mr="auto">{moreMenu}</HStack>
          </HStack>
        </FormControl>

        <ModalConfirm
          type={modalType}
          onSubmit={handleSubmitNew}
          onClose={() => setShowModal(false)}
          isOpen={showModal}
        />
      </Stack>
    </ScrollView>
  )
})

EditDevice.propTypes = {
  device: PropTypes.object.isRequired,
  edit: PropTypes.bool,
  groups: PropTypes.array,
  tags: PropTypes.array
}

export default EditDevice
