import React, { useEffect } from 'react'
import { useState } from 'react'
import { saveLogin, testLogin } from 'api'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faEthernet, faKey, faUser } from '@fortawesome/free-solid-svg-icons'
import Icon from 'FontAwesomeUtils'

import {
  Box,
  Button,
  Center,
  Text,
  View,
  Heading,
  HStack,
  VStack,
  FormControl,
  Input,
  Select,
  useColorModeValue
} from 'native-base'

const Setup = (props) => {
  const navigate = useNavigate()

  //NOTE could have > 2 wlan here
  const interfaces = ['eth0', 'wlan0', 'wlan1']

  const [password, setPassword] = useState('')
  const [countryWifi, setCountryWifi] = useState('US')
  const [interfaceWifi, setInterfaceWifi] = useState('wlan1')
  const [ssidWifi, setSsidWifi] = useState('SPRLab')
  const [interfaceUplink, setInterfaceUplink] = useState('eth0')
  const [errors, setErrors] = React.useState({})

  useEffect(() => {
    if ('login' in errors && password.length) {
      setErrors({})
    }
  }, [password])

  const handlePress = () => {
    const data = {
      password,
      interfaceWifi,
      interfaceUplink
    }

    if (password.length < 5) {
      setErrors({ login: 'Password needs to be at least 5 characters' })
      return
    }

    console.log('TODO*todo:post to API /setup:', data)
    //TODO country+channel
  }

  return (
    <View w="100%" alignItems="center">
      <Box
        safeArea
        px={4}
        py={8}
        w="90%"
        maxW={360}
        bg={useColorModeValue('white', 'blueGray.900')}
        rounded={10}
        shadow={2}
      >
        <Heading
          size="lg"
          fontWeight="300"
          color="coolGray.800"
          _dark={{
            color: 'warmGray.50'
          }}
          alignSelf="center"
        >
          Setup
        </Heading>
        <VStack space={4} mt={12}>
          <FormControl isInvalid={'interface' in errors}>
            <FormControl.Label>Wifi Interface</FormControl.Label>
            <Select
              selectedValue={interfaceWifi}
              onValueChange={(value) => setInterfaceWifi(value)}
            >
              <Select.Item label="eth0" value="eth0" isDisabled />
              <Select.Item label="wlan0" value="wlan0" isDisabled />
              <Select.Item label="wlan1" value="wlan1" />
            </Select>
          </FormControl>
          <FormControl isInvalid={'uplink' in errors}>
            <FormControl.Label>Uplink Interface</FormControl.Label>
            <Select
              selectedValue={interfaceUplink}
              onValueChange={(value) => setInterfaceUplink(value)}
            >
              <Select.Item label="eth0" value="eth0" />
              <Select.Item label="wlan0" value="wlan0" />
              <Select.Item label="wlan1" value="wlan1" isDisabled />
            </Select>
          </FormControl>
          <FormControl isInvalid={'ssid' in errors}>
            <FormControl.Label>SSID</FormControl.Label>
            <Input
              value={ssidWifi}
              variant="outline"
              size="md"
              InputLeftElement={
                <Icon size={4} ml={2} color="muted.400" />
              }
              placeholder="Password"
              onChangeText={(value) => setSsidWifi(value)}
              onSubmitEditing={handlePress}
            />
            {'ssid' in errors ? (
              <FormControl.ErrorMessage
                _text={{
                  fontSize: 'xs'
                }}
              >
                {errors.ssid}
              </FormControl.ErrorMessage>
            ) : null}
          </FormControl>
          <FormControl isInvalid={'country' in errors}>
            <FormControl.Label>Wifi Country Code</FormControl.Label>
            <Select
              selectedValue={countryWifi}
              onValueChange={(value) => setCountryWifi(value)}
            >
              <Select.Item label="US" value="US"  />
              <Select.Item label="SE" value="SE"  />
            </Select>
          </FormControl>
          <FormControl isInvalid={'login' in errors}>
            <FormControl.Label>Admin Password</FormControl.Label>
            <Input
              type="password"
              value={password}
              variant="outline"
              size="md"
              InputLeftElement={
                <Icon icon={faKey} size={4} ml={2} color="muted.400" />
              }
              placeholder="Password"
              onChangeText={(value) => setPassword(value)}
              onSubmitEditing={handlePress}
            />
            {'login' in errors ? (
              <FormControl.ErrorMessage
                _text={{
                  fontSize: 'xs'
                }}
              >
                {errors.login}
              </FormControl.ErrorMessage>
            ) : null}
          </FormControl>
          <Button
            mt={8}
            rounded="full"
            colorScheme="yellow"
            bg="#fbc658"
            _hover={{
              bg: '#fab526'
            }}
            onPress={handlePress}
          >
            Save
          </Button>
        </VStack>
      </Box>
    </View>
  )
}

export default Setup
