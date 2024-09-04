import React, { useContext, useState } from 'react'

import { deviceAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import { WifiConnect } from 'views/Devices/ConnectDevice'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelper,
  FormControlHelperText,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  HStack,
  Input,
  InputField,
  RadioGroup,
  Radio,
  RadioIndicator,
  RadioIcon,
  RadioLabel,
  Text,
  VStack,
  AlertCircleIcon,
  CircleIcon
} from '@gluestack-ui/themed'

const AddDevice = ({ disabled, onClose, onConnect, ...props }) => {
  const context = useContext(AlertContext)

  const [name, setName] = useState('adminDevice')
  const [policies, setPolicies] = useState(['dns', 'wan', 'lan'])
  const [wpa, setWpa] = useState('sae')
  const [psk, setPsk] = useState('')
  const [device, setDevice] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState({})

  const validatePassphrase = (value) => {
    if (value == '' || value.length >= 8) {
      return true
    }

    return false
  }

  const handleChange = (name, value) => {
    if (name == 'name') {
      setName(value)

      if (value.length < 1) {
        return setErrors({ ...errors, name: 'invalid name' })
      }
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

  const submitData = () => {
    let data = {
      MAC: 'pending',
      Name: name,
      Policies: policies,
      Groups: [],
      DeviceTags: [],
      PSKEntry: {
        Psk: psk,
        Type: wpa
      },
      Style: {
        Color: 'blueGray',
        Icon: 'Laptop'
      }
    }

    const handleErr = (error) => {
      let msg = error.toString()
      //api might be restarting - try again
      if (msg.match(/Failed to fetch/)) {
        setTimeout(submitData, 1000)
      } else {
        context.error(`Failed to add device: ${msg}`)
      }
    }

    deviceAPI
      .list()
      .then((devices) => {
        //if a previous request got through and connected, dont add again
        if (Object.values(devices).find((x) => x.Name == data.Name)) {
          setDevice(data)
          setSubmitted(true)
          return
        }

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
          .catch(handleErr)
      })
      .catch(handleErr)
  }

  const handleSubmit = () => {
    if (Object.keys(errors).length) {
      return context.error('Invalid fields: ' + Object.keys(errors).join(','))
    }

    //now submit to the API
    submitData()
  }

  if (submitted) {
    if (wpa != 'none') {
      return (
        <VStack space="md">
          <Text size="md" textAlign="center">
            Now connect your device
          </Text>
          <WifiConnect
            device={device}
            goBackSuccess={props.deviceAddedCallback}
            goBack={() => setSubmitted(false)}
            onSuccess={onConnect}
            hideBackOnSuccess
          />
          <HStack space="lg">
            <Button
              flex={1}
              action="secondary"
              variant="outline"
              size="md"
              onPress={onClose}
            >
              <ButtonText>Skip</ButtonText>
            </Button>
          </HStack>
        </VStack>
      )
    } else {
      onConnect()
      return <Text>Wired device added</Text>
    }
  }

  return (
    <VStack space="3xl" p="$4">
      <Text size="md">
        Add & connect your first device. In the next step, connect using your
        current device or a new one
      </Text>
      <VStack
        space="3xl"
        sx={{
          '@md': { flexDirection: 'row' }
        }}
      >
        <FormControl flex={1} isInvalid={'psk' in errors}>
          <FormControlLabel>
            <FormControlLabelText>Passphrase</FormControlLabelText>
          </FormControlLabel>
          <Input size="md">
            <InputField
              autoFocus
              type="password"
              autoComplete="new-password"
              autoCorrect={false}
              onChangeText={(value) => handleChange('psk', value)}
            />
          </Input>
          {'psk' in errors ? (
            <FormControlError>
              <FormControlErrorIcon as={AlertCircleIcon} />
              <FormControlErrorText>
                must be at least 8 characters long
              </FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                Optional. If empty a random password will be generated
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Authentication</FormControlLabelText>
          </FormControlLabel>

          <RadioGroup
            defaultValue={'sae'}
            accessibilityLabel="Auth"
            onChange={(value) => handleChange('wpa', value)}
          >
            <HStack py="$1" space="md" w="$full" flexWrap="wrap">
              <Radio value="sae" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>WPA3</RadioLabel>
              </Radio>
              <Radio value="wpa2" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>WPA2</RadioLabel>
              </Radio>
              <Radio value="none" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>Wired</RadioLabel>
              </Radio>
            </HStack>
          </RadioGroup>

          <FormControlHelper>
            <FormControlHelperText>WPA3 is recommended</FormControlHelperText>
          </FormControlHelper>
        </FormControl>
      </VStack>

      <HStack space="lg">
        <Button
          flex={1}
          action="primary"
          size="md"
          onPress={handleSubmit}
          disabled={disabled}
        >
          <ButtonText>Add Device</ButtonText>
        </Button>
        <Button
          flex={1}
          action="secondary"
          variant="outline"
          size="md"
          onPress={onClose}
        >
          <ButtonText>Skip</ButtonText>
        </Button>
      </HStack>
    </VStack>
  )
}

export default AddDevice
