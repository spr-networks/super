import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import ModalConfirm from 'components/ModalConfirm'

import Icon from 'FontAwesomeUtils'
import {
  faEllipsis,
  faLaptop,
  faMobileScreen,
  faPen,
  faTrash,
  faXmark
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

const Device = ({ device, edit, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
  const [groups, setGroups] = useState(device.Groups)
  const [tags, setTags] = useState(device.DeviceTags)
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
        direction="row"
        space={2}
        py={2}
        w="100%"
        key={device.MAC}
        justifyContent="space-between"
        alignItems="center"
      >
        <Stack
          direction={{ base: 'column', md: 'row' }}
          space={4}
          justifyContent="space-between"
          alignItems="center"
          minW="90%"
        >
          <Box bg="white" _dark={{ bg: 'blueGray.700' }} p={4} rounded="full">
            <Icon icon={icon} color={iconColor} size={7} />
          </Box>
          <VStack flex={1}>
            {edit ? (
              <Input
                size="lg"
                type="text"
                variant="underlined"
                value={name}
                onChangeText={(value) => handleName(value)}
                onSubmitEditing={handleSubmit}
              />
            ) : (
              <Text bold>{device.Name}</Text>
            )}
            {device.oui !== undefined ? (
              <Text color="muted.500">{device.oui}</Text>
            ) : null}
          </VStack>

          <Stack
            direction={{ base: 'row', md: 'column' }}
            space={2}
            alignSelf="center"
            alignItems="center"
          >
            <Text bold>{device.RecentIP}</Text>
            <Text fontSize="xs" color="muted.500">
              {device.MAC}
            </Text>
          </Stack>

          <Text display={{ base: 'none', md: 'flex' }} alignSelf="center">
            {wifi_type}
          </Text>

          <HStack flex={2} space={1} alignSelf="center" alignItems="center">
            {groups.map((group) => (
              <Badge key={group} variant="solid">
                {group}
              </Badge>
            ))}

            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}

            {/*<Menu
              trigger={(triggerProps) => {
                return (
                  <IconButton
                    display={{ base: edit ? 'flex' : 'none' }}
                    size="xs"
                    variant="ghost"
                    icon={<Icon icon={faPen} />}
                    {...triggerProps}
                  />
                )
              }}
            >
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
                </Menu>*/}
          </HStack>
        </Stack>

        <Box
          display={{ base: edit ? 'flex' : 'none' }}
          w="50"
          marginLeft="auto"
          justifyContent="center"
        >
          {/*<Button.Group size="sm">
            <IconButton
              variant="ghost"
              colorScheme="secondary"
              icon={<Icon icon={faXmark} />}
              onPress={removeDevice}
            />
            </Button.Group>*/}
          {moreMenu}
        </Box>
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
