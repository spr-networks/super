import React, { useContext, useEffect, useState } from 'react'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import WifiConnect from 'views/Devices/ConnectDevice'
import { format as timeAgo } from 'timeago.js'
import InputSelect from 'components/InputSelect'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Input,
  Radio,
  ScrollView,
  Stack,
  Text,
  Tooltip
} from 'native-base'

const AddDevice = (props) => {
  const context = useContext(AlertContext)

  const [mac, setMac] = useState('')
  const [name, setName] = useState('')
  const [groups, setGroups] = useState(['dns', 'wan'])
  const [tags, setTags] = useState([])
  const [wpa, setWpa] = useState('sae')
  const [psk, setPsk] = useState('')
  const [vlan, setVlan] = useState('')
  const [device, setDevice] = useState({})
  const [expiration, setExpiration] = useState(0)
  const [deleteExpiry, setDeleteExpiry] = useState(false)

  const [submitted, setSubmitted] = useState(false)

  const [errors, setErrors] = useState({})

  const expirationOptions = [
    {label: 'Never', value: 0},
    {label: '1 Hour', value: 60*60},
    {label: '1 Day', value: 60*60*24},
    {label: '1 Week', value: 60*60*24*7},
    {label: '4 Weeks', value: 60*60*24*7*4},
  ]

  const tagTips = {
    'guest': 'This is a guest device',
    'lan_upstream': "lan_upstream allows devices to query LAN addresses upstream of the SPR Router"
  }

  useEffect(() => {
    deviceAPI.list().then((devs) => {
      let pendingDevice = devs.pending !== undefined ? devs.pending : null

      if (pendingDevice) {
        context.info(
          'Got Pending Device',
          `Device "${pendingDevice.Name}" is added but not connected. Adding a new device will overwrite it`
        )
      }
    })
  }, [])

  const filterMAC = (value) => {
    //must be of the format 00:00:00:00:00:00
    const hexChars = '0123456789abcdef'
    let digits = ''
    for (let c of value) {
      if (hexChars.indexOf(c) != -1) {
        digits += c
      }
    }
    let mac = ''
    let i = 0
    for (i = 0; i < digits.length - 1 && i < 6 * 2; i += 2) {
      mac += digits[i]
      mac += digits[i + 1]
      mac += ':'
    }
    if (i < digits.length && i < 6 * 2) {
      mac += digits[i]
    }
    if (mac[mac.length - 1] == ':') {
      mac = mac.slice(0, mac.length - 1)
    }
    return mac
  }
  const validateMAC = (value) => {
    if (value == '' || value.length == 17) {
      return true
    }

    return false
  }

  const validatePassphrase = (value) => {
    if (value == '' || value.length >= 8) {
      return true
    }

    return false
  }

  const allGroups = ['wan', 'dns', 'lan']
  const groupTips = {
    'wan': 'Allow Internet Access',
    'dns': 'Allow DNS Queries',
    'lan': 'Allow access to ALL other devices on the network'
  }
  const allTags = ['lan_upstream', 'guest']

  const isPositiveNumber = (str) => {
    let num = parseFloat(str)
    return !isNaN(num) && num > 0
  }

  const handleChange = (name, value) => {
    if (name == 'name') {
      setName(value)

      if (value.length < 1) {
        return setErrors({ ...errors, name: 'invalid name' })
      }
    }

    if (name == 'mac') {
      value = filterMAC(value)
      if (!validateMAC(value)) {
        return setErrors({ ...errors, mac: 'invalid MAC address' })
      }

      setMac(value)
    }

    if (name == 'psk') {
      if (!validatePassphrase(value)) {
        return setErrors({ ...errors, psk: 'invalid passphrase' })
      }

      setPsk(value)
    }

    if (name == 'wpa') {
      setWpa(value)
    }

    if (name == 'vlan') {
      if (!isPositiveNumber(value)) {
        return setErrors({ ...errors, VLAN: 'invalid vlan tag' })
      }
      setVlan(value)
      setWpa('none')
    }

    if (name == 'Expiration') {
      setExpiration(value)
    }

    setErrors({})
  }

  const handleSubmit = () => {
    if (Object.keys(errors).length) {
      return context.error('Invalid fields: ' + Object.keys(errors).join(','))
    }

    if (wpa == 'none' || vlan != '') {
      if (mac == '') {
        return context.error(
          'A mac address assignment is needed when setting a wired vlan tag'
        )
      }
    }

    let data = {
      MAC: mac || 'pending',
      Name: name,
      Groups: groups,
      DeviceTags: tags,
      PSKEntry: {
        Psk: psk,
        Type: wpa
      }
    }

    /*
      DeviceTimeout  int64
      DeleteTimeout  bool
      Disabled bool
    */

    if (wpa == 'none') {
      delete data.PSKEntry
      data.VLANTag = vlan
    }

    //now submit to the API
    deviceAPI
      .update(data)
      .then((device) => {
        if (psk.length) {
          device.PSKEntry.Psk = psk
        } else {
          setPsk(device.PSKEntry.Psk)
        }

        setDevice(device)
        setSubmitted(true)
      })
      .catch((error) => {
        context.error('DEVICE API:', error)
      })
  }

  if (submitted) {
    return <WifiConnect device={device} goBack={() => setSubmitted(false)} />
  }

  return (
    <ScrollView space={2} width={['100%', '100%', '5/6']} h={'100%'}>
      <Heading fontSize="lg">Add a new WiFi Device</Heading>
      <Text color="muted.500" fontSize="xs">
        Wired devices do not need to be added here. They will show up when they
        DHCP, and need WAN/DNS assignment for internet access.
      </Text>
      <Text color="muted.500" fontSize="xs">
        If they they need a VLAN Tag ID for a Managed Port do add the device
        here.
      </Text>
      <FormControl isRequired isInvalid={'name' in errors}>
        <FormControl.Label>Device Name</FormControl.Label>
        <Input
          size="md"
          autoFocus
          value={name}
          onChangeText={(value) => handleChange('name', value)}
          onBlur={() => handleChange('name', name)}
          onSubmitEditing={handleSubmit}
        />
        {'name' in errors ? (
          <FormControl.ErrorMessage>Cannot be empty</FormControl.ErrorMessage>
        ) : (
          <FormControl.HelperText>
            A unique name for the device
          </FormControl.HelperText>
        )}
      </FormControl>

      <Stack space={2} minH={180}>
        <FormControl flex="1" isInvalid={'mac' in errors}>
          <FormControl.Label>MAC Address</FormControl.Label>
          <Input
            variant="underlined"
            autoComplete="new-password"
            onChangeText={(value) => handleChange('mac', value)}
          />
          {'mac' in errors ? (
            <FormControl.ErrorMessage>
              format: 00:00:00:00:00:00
            </FormControl.ErrorMessage>
          ) : (
            <FormControl.HelperText>
              Optional. Will be assigned on connect if empty
            </FormControl.HelperText>
          )}
        </FormControl>

        <FormControl flex="1" isInvalid={'VLAN' in errors}>
          <FormControl.Label>VLAN Tag ID</FormControl.Label>
          <Input
            variant="underlined"
            autoComplete="new-password"
            onChangeText={(value) => handleChange('vlan', value)}
          />
          {'VLAN' in errors ? (
            <FormControl.ErrorMessage>format: 1234</FormControl.ErrorMessage>
          ) : (
            <FormControl.HelperText>
              Only needed for Wired devices on a managed port, set VLAN Tag ID
            </FormControl.HelperText>
          )}
        </FormControl>

        <FormControl flex="1">
          <FormControl.Label>Authentication</FormControl.Label>
          <Radio.Group
            name="Auth"
            defaultValue={'sae'}
            accessibilityLabel="Auth"
            onChange={(value) => handleChange('wpa', value)}
          >
            <HStack py="1" space={3}>
              <Radio size="sm" value="sae">
                WPA3
              </Radio>
              <Radio size="sm" value="wpa2">
                WPA2
              </Radio>
              <Radio size="sm" value="none">
                Wired
              </Radio>
            </HStack>
          </Radio.Group>
          <FormControl.HelperText>WPA3 is recommended</FormControl.HelperText>
        </FormControl>
      </Stack>

      <Stack
        direction={{ base: 'column', md: 'row' }}
        space={4}
        alignItems="flex-start"
        pb={8}
      >
        <FormControl flex="2" isInvalid={'psk' in errors}>
          <FormControl.Label>Passphrase</FormControl.Label>
          <Input
            variant="underlined"
            type="password"
            autoComplete="new-password"
            autoCorrect={false}
            onChangeText={(value) => handleChange('psk', value)}
          />
          {'psk' in errors ? (
            <FormControl.ErrorMessage>
              must be at least 8 characters long
            </FormControl.ErrorMessage>
          ) : (
            <FormControl.HelperText>
              Optional. If empty a random password will be generated
            </FormControl.HelperText>
          )}
        </FormControl>

        <FormControl flex={2}>
          <FormControl.Label>Groups</FormControl.Label>
          <Checkbox.Group
            defaultValue={groups}
            accessibilityLabel="Set Device Groups"
            onChange={(values) => setGroups(values)}
            py={1}
          >
            <HStack w="100%" justifyContent="space-between">
              {allGroups.map((group) => (
                  (groupTips[group] !== null ) ?  (
                    <Tooltip label={groupTips[group]} openDelay={300}>
                    <Box key={group} flex={1}>
                    <Checkbox value={group} colorScheme="primary">
                      {group}
                    </Checkbox>
                    </Box>
                    </Tooltip>
                  ) :
                  (
                  <Box key={group} flex={1}>
                  <Checkbox value={group} colorScheme="primary">
                    {group}
                  </Checkbox>
                  </Box>
                  )
              ))}
            </HStack>
          </Checkbox.Group>

          <FormControl.HelperText>
            Assign device to groups for network access
          </FormControl.HelperText>
        </FormControl>

        <FormControl flex={2}>
          <FormControl.Label>Tags</FormControl.Label>
          <Checkbox.Group
            defaultValue={tags}
            accessibilityLabel="Set Device Tags"
            onChange={(values) => setTags(values)}
            py={1}
          >
            <HStack w="100%" justifyContent="space-between">
              {allTags.map((tag) => (
                <Tooltip label={tagTips[tag]} openDelay={300}>
                <Box key={tag} flex={1}>
                  <Checkbox value={tag} colorScheme="primary">
                    {tag}
                  </Checkbox>
                </Box>
                </Tooltip>
              ))}
            </HStack>
          </Checkbox.Group>

          <FormControl.HelperText>Assign device tags</FormControl.HelperText>
        </FormControl>
      </Stack>

      <Stack>
        <FormControl flex={2}>
          <FormControl.Label>Expiration</FormControl.Label>

          <InputSelect
            options={expirationOptions}
            value={
              expiration
                ? timeAgo(new Date(Date.now() + expiration * 1e3))
                : 'Never'}
            onChange={(v) => handleChange('Expiration', parseInt(v))}
            onChangeText={(v) => handleChange('Expiration', parseInt(v))}
          />

          <FormControl.HelperText>
            If non zero has unix time for when the entry should disappear
          </FormControl.HelperText>

          <FormControl.Label>Delete on expiry</FormControl.Label>
          <Checkbox
            accessibilityLabel="Enabled"
            value={deleteExpiry}
            isChecked={deleteExpiry}
            onChange={(enabled) =>
              setDeleteExpiry(!deleteExpiry)
            }
          >
            Remove device
          </Checkbox>

        </FormControl>
      </Stack>

      <Stack mt={4}>
        <Button color="primary" size="md" onPress={handleSubmit}>
          Save
        </Button>
      </Stack>
    </ScrollView>
  )
}

export default AddDevice
