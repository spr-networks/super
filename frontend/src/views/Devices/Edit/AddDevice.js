import React, { useState } from 'react'
import Select from 'react-select'
import TagsInput from 'react-tagsinput'

import {
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Input,
  Radio,
  Stack,
  Text
} from 'native-base'

let did_submit = false

const Step1 = React.forwardRef((props, ref) => {
  const [mac, setMac] = useState('')
  const [psk, setPsk] = useState('')
  const [wpa, setWpa] = useState('sae')
  const [name, setName] = useState('')
  const [groups, setGroups] = useState(['dns', 'wan'])

  const [errors, setErrors] = useState({})

  let submitted = () => {
    return did_submit
  }
  let setSubmitted = (v) => {
    did_submit = v
  }

  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      if (isValidated()) {
        return true
      }
      return false
    },
    state: {
      mac,
      psk,
      wpa,
      name,
      groups,
      errors,

      submitted,
      setSubmitted
    }
  }))

  // function that verifies if a string has a given length or not
  const verifyLength = (value, length) => {
    if (value.length >= length) {
      return true
    }
    return false
  }

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

  const isValidated = () => Object.keys(errors).length == 0

  const allGroups = ['wan', 'dns', 'lan']

  const handleChange = (name, value) => {
    setSubmitted(false)

    if (name == 'name') {
      if (!verifyLength(value, 1)) {
        return setErrors({ ...errors, name: 'invalid name' })
      }

      setName(value)
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

      setWpa(value)
    }

    setErrors({})
  }

  return (
    <Stack space={4}>
      <Heading fontSize="lg">Add a new WiFi Device</Heading>
      <Text color="muted.500" fontSize="xs" mt="-3">
        Wired devices do not need to be added
      </Text>

      <FormControl isRequired isInvalid={'name' in errors}>
        <FormControl.Label>Device Name</FormControl.Label>
        <Input
          type="text"
          autoFocus
          onChangeText={(value) => handleChange('name', value)}
          onBlur={() => handleChange('name', name)}
        />
        {'name' in errors ? (
          <FormControl.ErrorMessage>cannot be empty</FormControl.ErrorMessage>
        ) : (
          <FormControl.HelperText>
            A unique name for the device
          </FormControl.HelperText>
        )}
      </FormControl>

      <FormControl>
        <FormControl.Label>Auth</FormControl.Label>
        <Radio.Group
          name="Auth"
          defaultValue={'sae'}
          accessibilityLabel="Auth"
          onChange={(value) => handleChange('wpa', value)}
        >
          <HStack space={2}>
            <Radio size="sm" value="sae">
              WPA3
            </Radio>
            <Radio size="sm" value="wpa2">
              WPA2
            </Radio>
          </HStack>
        </Radio.Group>
      </FormControl>

      <FormControl isInvalid={'mac' in errors}>
        <FormControl.Label>MAC Address</FormControl.Label>
        <Input
          name="mac"
          type="text"
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

      <FormControl isInvalid={'psk' in errors}>
        <FormControl.Label>Passphrase</FormControl.Label>
        <Input
          name="psk"
          type="password"
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

      <FormControl>
        <FormControl.Label>Groups</FormControl.Label>
        <Checkbox.Group
          defaultValue={groups}
          direction="row"
          accessibilityLabel="Set Device Groups"
          onChange={(values) => setGroups(values)}
        >
          {allGroups.map((group) => (
            <Checkbox value={group} colorScheme="primary">
              {group}
            </Checkbox>
          ))}
        </Checkbox.Group>

        <FormControl.HelperText>
          Assign device to groups for network access
        </FormControl.HelperText>
      </FormControl>
    </Stack>
  )
})

export default Step1
