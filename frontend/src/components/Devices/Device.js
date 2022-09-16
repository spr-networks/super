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
  faTag
} from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Button,
  Box,
  IconButton,
  Input,
  Menu,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

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
    <Button
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
    </Button>
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
    <Button
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
    </Button>
  )
})

const Device = ({ device, edit, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
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

  const saveDevice = async () => {
    let id = device.MAC || device.WGPubKey
    if (!name) {
      return
    }

    deviceAPI
      .updateName(id, name)
      .then(notifyChange)
      .catch((error) =>
        context.error('[API] updateName error: ' + error.message)
      )
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
      <Menu.Group title="Actions">
        <Menu.Item onPress={removeDevice}>
          <HStack space={2} alignItems="center">
            <Icon icon={faTrash} color="danger.700" />
            <Text color="danger.700">Delete</Text>
          </HStack>
        </Menu.Item>
      </Menu.Group>
    </Menu>
  )

  return (
    <>
      <Stack
        direction={{ base: 'column-reverse', md: 'row' }}
        space={2}
        p={4}
        w="100%"
        key={device.MAC}
        justifyContent="space-between"
        alignItems="center"
        _light={{ borderColor: 'coolGray.200' }}
        _dark={{ borderColor: 'muted.700' }}
        borderBottomWidth={1}
      >
        <Stack
          direction={{ base: 'column', md: 'row' }}
          space={4}
          flex={1}
          justifyContent="space-between"
          alignItems="center"
        >
          <Box
            display={{ base: 'none', md: 'flex' }}
            bg="white"
            _dark={{ bg: 'blueGray.700' }}
            p={4}
            rounded="full"
            opacity={device.isConnected ? 1 : 0.65}
            borderColor={borderColor}
            borderWidth={1}
          >
            <Icon icon={icon} color={iconColor} size={7} />
          </Box>

          <VStack w={{ base: '100%', md: '20%' }} px={2}>
            {edit ? (
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
              <Text bold>{device.Name}</Text>
            )}

            <Text color="muted.500">
              {device.oui !== undefined ? device.oui : ' '}
            </Text>
          </VStack>

          <Stack
            w={{ base: '100%', md: '12%' }}
            direction={{ base: 'row', md: 'column' }}
            space={1}
            justifyContent={{ base: 'space-around', md: 'center' }}
          >
            <Text bold>{device.RecentIP}</Text>
            <Text fontSize="xs" color="muted.500">
              {device.MAC}
            </Text>
          </Stack>
          <Text
            w={{ base: '100%', md: '8%' }}
            display={{ base: 'none', md: 'flex' }}
            justifyContent="center"
          >
            {wifi_type}
          </Text>
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
        {edit ? moreMenu : null}
      </Stack>
      <ModalConfirm
        type={modalType}
        onSubmit={handleSubmitNew}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </>
  )
}

Device.propTypes = {
  device: PropTypes.object.isRequired,
  edit: PropTypes.bool,
  groups: PropTypes.array,
  tags: PropTypes.array
}

export default Device
