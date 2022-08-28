import React, { useContext, useState } from 'react'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import WifiConnect from 'views/Devices/ConnectDevice'

import {
  Box,
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

const AddDevice = (props) => {
  const context = useContext(AlertContext)

  const [mac, setMac] = useState('')
  const [name, setName] = useState('')
  const [groups, setGroups] = useState(['dns', 'wan'])
  const [wpa, setWpa] = useState('sae')
  const [psk, setPsk] = useState('')
  const [device, setDevice] = useState({})

  const [submitted, setSubmitted] = useState(false)

  const [errors, setErrors] = useState({})

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

    setErrors({})
  }

  const handleSubmit = () => {
    if (Object.keys(errors).length) {
      return context.error('Invalid fields: ' + Object.keys(errors).join(','))
    }

    let data = {
      MAC: mac || 'pending',
      Name: name,
      Groups: groups,
      PSKEntry: {
        Psk: psk,
        Type: wpa
      }
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
        context.error(error.message)
      })
  }

  if (submitted) {
    return <WifiConnect device={device} goBack={() => setSubmitted(false)} />
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

      <Stack direction={{ base: 'column', md: 'row' }} space={4}>
        <FormControl flex="1" isInvalid={'mac' in errors}>
          <FormControl.Label>MAC Address</FormControl.Label>
          <Input
            variant="underlined"
            autoComplete="off"
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

        <FormControl flex="1">
          <FormControl.Label>Auth</FormControl.Label>
          <Radio.Group
            name="Auth"
            defaultValue={'sae'}
            accessibilityLabel="Auth"
            onChange={(value) => handleChange('wpa', value)}
          >
            <HStack py="1" space={2}>
              <Radio size="sm" value="sae">
                WPA3
              </Radio>
              <Radio size="sm" value="wpa2">
                WPA2
              </Radio>
            </HStack>
          </Radio.Group>
          <FormControl.HelperText>WPA3 is recommended</FormControl.HelperText>
        </FormControl>
      </Stack>

      <Stack
        direction={{ base: 'column', md: 'row' }}
        space={4}
        alignItems="center"
      >
        <FormControl flex="1" isInvalid={'psk' in errors}>
          <FormControl.Label>Passphrase</FormControl.Label>
          <Input
            variant="underlined"
            type="password"
            autoComplete="off"
            autoCorrect="off"
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

        <FormControl flex="1">
          <FormControl.Label>Groups</FormControl.Label>
          <Checkbox.Group
            defaultValue={groups}
            accessibilityLabel="Set Device Groups"
            onChange={(values) => setGroups(values)}
            py={1}
          >
            <HStack w="100%" justifyContent="space-between">
              {allGroups.map((group) => (
                <Box key={group} flex={1}>
                  <Checkbox value={group} colorScheme="primary">
                    {group}
                  </Checkbox>
                </Box>
              ))}
            </HStack>
          </Checkbox.Group>

          <FormControl.HelperText>
            Assign device to groups for network access
          </FormControl.HelperText>
        </FormControl>
      </Stack>

      <Button mt="4" color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

export default AddDevice
