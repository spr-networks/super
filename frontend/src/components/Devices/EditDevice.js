import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { AlertContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import ModalConfirm from 'components/ModalConfirm'

import { format as timeAgo } from 'timeago.js'
import InputSelect from 'components/InputSelect'
import DeviceExpiry from './DeviceExpiry'

import {
  Box,
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxGroup,
  CheckboxLabel,
  CheckIcon,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelper,
  FormControlHelperText,
  Heading,
  HStack,
  Icon,
  Input,
  InputField,
  ScrollView,
  VStack,
  Text,
  Tooltip,
  TooltipContent,
  TooltipText,
  ButtonIcon,
  ThreeDotsIcon,
  ArrowLeftIcon,
  Menu,
  MenuItem,
  MenuItemLabel,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { Address4 } from 'ip-address'

import { TagItem, GroupItem, PolicyItem } from 'components/TagItem'
import ColorPicker from 'components/ColorPicker'
import IconPicker from 'components/IconPicker'

import { GroupMenu, PolicyMenu, TagMenu } from 'components/TagMenu'

const EditDevice = ({ device, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.Name)
  const [rawIP, setRawIP] = useState(device.RecentIP)
  const [ip, setIP] = useState(device.RecentIP)
  const [vlantag, setVlanTag] = useState(device.VLANTag)
  const [policies, setPolicies] = useState(device.Policies?.sort() || [])
  const [groups, setGroups] = useState(device.Groups.sort())
  const [tags, setTags] = useState(device.DeviceTags.sort())
  const [color, setColor] = useState(device.Style?.Color || 'blueGray')
  const [icon, setIcon] = useState(device.Style?.Icon || 'Laptop')
  const [expiration, setExpiration] = useState(
    device.DeviceExpiration ? device.DeviceExpiration : 0
  )
  const [deleteExpiry, setDeleteExpiry] = useState(
    device.DeleteExpiration || false
  )

  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')

  // for adding
  const defaultPolicies = ['wan', 'dns', 'lan', 'lan_upstream', 'disabled']
  const policyName = {
    wan: 'Internet Access',
    dns: 'DNS Resolution',
    lan: 'Local Network',
    lan_upstream: 'Upstream Private Networks',
    disabled: 'Disabled'
  }
  const policyTips = {
    wan: 'Allow Internet Access',
    dns: 'Allow DNS Queries',
    lan: 'Allow access to ALL other devices on the network',
    lan_upstream: 'Allow device to reach private LANs upstream',
    disabled: 'Override all policies and groups, to disconnect device'
  }
  const defaultGroups = props.groups || []
  const defaultTags = props.tags || []

  const navigate = useNavigate()

  useEffect(() => {
    // if not icon is set, try to match on name
    if (!device.Style?.Icon) {
      if (name.match(/iphone/i)) {
        setIcon('Apple')
      } else if (name.match(/android/i)) {
        setIcon('Android')
      } else if (name.match(/phone/i)) {
        setIcon('Mobile')
      } else {
        setIcon('Laptop')
      }
    }
  }, [])

  useEffect(() => {
    if (!icon || !color) {
      return
    }

    if (icon != device.Style?.Icon || color != device.Style?.Color) {
      deviceAPI
        .updateStyle(device.MAC || device.WGPubKey, {
          Icon: icon,
          Color: color
        })
        .then(notifyChange)
        .catch((error) => {
          context.error(`[API] updateStyle error: ${error.message}`)
        })
    }
  }, [icon, color])

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

  const handlePolicies = (policies) => {
    if (!device.MAC && !device.WGPubKey) {
      return
    }

    setPolicies([...new Set(policies.filter((v) => typeof v === 'string'))])

    deviceAPI
      .updatePolicies(device.MAC || device.WGPubKey, policies)
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
      .then(notifyChange)
      .catch((error) =>
        context.error('[API] updateDevice error: ' + error.message)
      )
  }

  const handleName = (name) => {
    setName(name)
    setEditing(name != device.Name)
  }

  const isPositiveNumber = (str) => {
    let num = parseFloat(str)
    return !isNaN(num) && num > 0
  }

  const handleVLAN = (value) => {
    if (isPositiveNumber(value) || value == '') {
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
      handleIPImpl(rawIP)
    }, 1000) // delay in milliseconds

    return () => clearTimeout(timer) // this will clear the timer in case inputValue changes within 2 seconds
  }, [rawIP])

  const handleIP = (value) => {
    setRawIP(value)
  }

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
              '. IP not in range or not a valid Supernetwork Device IP'
          )
        )
    }

    if (vlantag != device.VLANTag) {
      //api cant distinguish empty on assignment,
      // so set it to "0"
      deviceAPI
        .updateVLANTag(id, vlantag == '' ? '0' : vlantag)
        .then(notifyChange)
        .catch((error) =>
          context.error('[API] update VLAN Tag error: ' + error.message)
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

  useEffect(() => {
    let id = device.MAC || device.WGPubKey

    if (
      expiration != device.DeviceExpiration ||
      deleteExpiry != device.DeleteExpiration
    ) {
      //NOTE we submit timestamp from now, but get a timestamp in the future
      let DeviceExpiration =
        expiration < 0 ? -1 : expiration - parseInt(Date.now() / 1e3)

      deviceAPI
        .update(id, {
          DeviceExpiration,
          DeleteExpiration: deleteExpiry
        })
        .then(notifyChange)
        .catch((err) => {
          context.error(`update device failed:`, err)
        })
    }

    saveDevice()
  }, [expiration, deleteExpiry])

  const handleChange = (name, value) => {
    if (name == 'Expiration') {
      if (value == 0 && expiration != 0) {
        //gotcha in the API is to reset should set to -1
        //this is so that setting 0 does not update expiry
        value = -1
      } else {
        value = parseInt(Date.now() / 1e3) + value
      }

      setExpiration(value)
    }
  }

  return (
    <VStack
      space="lg"
      bg="$backgroundCardLight"
      sx={{
        '@md': { width: '$5/6' },
        _dark: { bg: '$backgroundCardDark' }
      }}
      p="$4"
    >
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>

        <Input variant="outline">
          <InputField
            type="text"
            value={name}
            autoFocus={false}
            onChangeText={(value) => handleName(value)}
            onSubmitEditing={handleSubmit}
          />
        </Input>

        {device.oui !== undefined ? (
          <FormControlHelper>
            <FormControlHelperText>{device.oui}</FormControlHelperText>
          </FormControlHelper>
        ) : null}
      </FormControl>

      <FormControl>
        <Tooltip
          placement="bottom"
          trigger={(triggerProps) => {
            return (
              <FormControlLabel {...triggerProps}>
                <FormControlLabelText>IP address</FormControlLabelText>
              </FormControlLabel>
            )
          }}
        >
          <TooltipContent>
            <TooltipText>
              Assign Micro Segmentation IP, every 4th ip from 2 (.2, .6, .10,
              .14, ...). Check the Supernetworks view to create new subnets
            </TooltipText>
          </TooltipContent>
        </Tooltip>

        <Input variant="underlined">
          <InputField
            type="text"
            value={rawIP}
            autoFocus={false}
            onChangeText={(value) => handleIP(value)}
            onSubmitEditing={handleSubmit}
          />
        </Input>
      </FormControl>

      <FormControl>
        <Tooltip
          placement="bottom"
          trigger={(triggerProps) => {
            return (
              <FormControlLabel {...triggerProps}>
                <FormControlLabelText>VLAN Tag ID</FormControlLabelText>
              </FormControlLabel>
            )
          }}
        >
          <TooltipContent>
            <TooltipText>
              For Wired Devices on a Managed Port: Assign VLAN Tag ID
            </TooltipText>
          </TooltipContent>
        </Tooltip>

        <Input variant="underlined">
          <InputField
            type="text"
            value={vlantag}
            autoFocus={false}
            onChangeText={(value) => handleVLAN(value)}
            onSubmitEditing={handleSubmit}
          />
        </Input>
      </FormControl>

      <HStack space="md">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>
              {device.MAC ? 'MAC address' : 'WG Pubkey'}
            </FormControlLabelText>
          </FormControlLabel>
          <Text isTruncated>{device.MAC || device.WGPubKey}</Text>
        </FormControl>

        <FormControl flex={1} display={device.MAC ? 'flex' : 'none'}>
          <FormControlLabel>
            <FormControlLabelText>WiFi Auth</FormControlLabelText>
          </FormControlLabel>
          <Text>{wifi_type}</Text>
        </FormControl>
      </HStack>

      <FormControl flex={4}>
        <FormControlLabel>
          <FormControlLabelText>Policies</FormControlLabelText>
        </FormControlLabel>

        <CheckboxGroup
          value={policies}
          accessibilityLabel="Set Device Policies"
          onChange={(values) => handlePolicies(values)}
          py="$1"
        >
          <HStack flex={1} space="md" w="$full" flexWrap="wrap">
            {defaultPolicies.map((policy) =>
              policyTips[policy] !== null ? (
                <Tooltip
                  h={undefined}
                  placement="bottom"
                  trigger={(triggerProps) => {
                    return (
                      <Box {...triggerProps}>
                        <Checkbox value={policy} colorScheme="primary">
                          <CheckboxIndicator mr="$2">
                            <CheckboxIcon />
                          </CheckboxIndicator>
                          <CheckboxLabel>{policyName[policy]}</CheckboxLabel>
                        </Checkbox>
                      </Box>
                    )
                  }}
                >
                  <TooltipContent>
                    <TooltipText>{policyTips[policy]}</TooltipText>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Checkbox value={policy} colorScheme="primary">
                  <CheckboxIndicator mr="$2">
                    <CheckboxIcon />
                  </CheckboxIndicator>
                  <CheckboxLabel>{policy}</CheckboxLabel>
                </Checkbox>
              )
            )}
          </HStack>
        </CheckboxGroup>

        <FormControlHelper>
          <FormControlHelperText>
            Assign device policies for network access
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Groups</FormControlLabelText>
        </FormControlLabel>
        <HStack flexWrap="wrap" w="$full" space="md">
          <HStack
            space="md"
            flexWrap="wrap"
            alignItems="center"
            display={groups?.length ? 'flex' : 'none'}
          >
            {groups.map((group) => (
              <GroupItem key={group} name={group} size="sm" />
            ))}
          </HStack>

          <GroupMenu
            items={[...new Set(defaultGroups.concat(groups))]}
            selectedKeys={groups}
            onSelectionChange={handleGroups}
          />
        </HStack>

        <FormControlHelper>
          <FormControlHelperText>
            Assign to network access group
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Tags</FormControlLabelText>
        </FormControlLabel>

        <HStack flexWrap="wrap" w="$full" space="md">
          <HStack
            space="md"
            flexWrap="wrap"
            alignItems="center"
            display={tags?.length ? 'flex' : 'none'}
          >
            {tags.map((tag) => (
              <TagItem key={tag} name={tag} size="sm" />
            ))}
          </HStack>
          <TagMenu
            items={[...new Set(defaultTags.concat(tags))]}
            selectedKeys={tags}
            onSelectionChange={handleTags}
          />
        </HStack>
      </FormControl>

      <VStack space="lg">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Icon</FormControlLabelText>
          </FormControlLabel>
          {icon ? (
            <IconPicker
              value={icon}
              color={color}
              onChange={(icon) => setIcon(icon)}
            />
          ) : null}
        </FormControl>
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Color</FormControlLabelText>
          </FormControlLabel>

          <ColorPicker value={color} onChange={(color) => setColor(color)} />
        </FormControl>
      </VStack>

      <VStack
        space="lg"
        sx={{ '@md': { flexDirection: 'row', maxWidth: '$1/2' } }}
      >
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Expiration</FormControlLabelText>
          </FormControlLabel>

          <DeviceExpiry
            value={expiration}
            onChange={(v) => handleChange('Expiration', v)}
          />

          <FormControlHelper>
            <FormControlHelperText>
              {/*If non zero has unix time for when the entry should disappear*/}
              {expiration > 0
                ? `Expire in ${timeAgo(
                    new Date(expiration * 1e3).toUTCString()
                  )}`
                : null}
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl sx={{ '@md': { marginTop: '$9' } }}>
          <Checkbox
            accessibilityLabel="Enabled"
            value={deleteExpiry}
            isChecked={deleteExpiry}
            onChange={(enabled) => setDeleteExpiry(!deleteExpiry)}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon as={CheckIcon} />
            </CheckboxIndicator>
            <CheckboxLabel>Delete on expiry</CheckboxLabel>
          </Checkbox>
        </FormControl>
      </VStack>

      <Button action="secondary" onPress={() => navigate('/admin/devices')}>
        <ButtonIcon as={ArrowLeftIcon} />
        <ButtonText>Back</ButtonText>
      </Button>

      <ModalConfirm
        type={modalType}
        onSubmit={handleSubmitNew}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </VStack>
  )
}

EditDevice.propTypes = {
  device: PropTypes.object.isRequired,
  edit: PropTypes.bool,
  groups: PropTypes.array,
  policies: PropTypes.array,
  tags: PropTypes.array
}

export default EditDevice
