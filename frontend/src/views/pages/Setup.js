import React, { useContext, useEffect } from 'react'
import { useState } from 'react'
import { api } from 'api'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faEthernet,
  faInfoCircle,
  faKey,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import Icon from 'FontAwesomeUtils'

import {
  Box,
  Button,
  Center,
  Text,
  View,
  Link,
  Heading,
  HStack,
  VStack,
  FormControl,
  Input,
  Select,
  useColorModeValue
} from 'native-base'
import { AlertContext } from 'AppContext'

const Setup = (props) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()

  //NOTE could have > 2 wlan here
  const interfaces = ['eth0', 'wlan0', 'wlan1']

  const [ssid, setSsid] = useState('SPRLab')
  const [countryWifi, setCountryWifi] = useState('US')
  const [interfaceWifi, setInterfaceWifi] = useState('wlan1')
  const [interfaceUplink, setInterfaceUplink] = useState('eth0')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = React.useState({})
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    api
      .get('/setup')
      .then((res) => {})
      .catch((err) => {
        setIsDone(true)
      })
  }, [])

  useEffect(() => {
    if ('login' in errors && password.length) {
      setErrors({})
    }
  }, [password])

  const handlePress = () => {
    const data = {
      InterfaceUplink: interfaceUplink,
      SSID: ssid,
      CountryCode: countryWifi,
      InterfaceSSID: interfaceWifi,
      AdminPassword: password
    }

    if (password.length < 5) {
      setErrors({ login: 'Password needs to be at least 5 characters' })
      return
    }

    api
      .put('/setup', data)
      .then((res) => {
        setIsDone(true)
      })
      .catch((err) => {
        setIsDone(true)
      })
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
          {isDone ? (
            <>
              <HStack alignSelf="center" alignItems="center" space={2}>
                <Icon icon={faInfoCircle} color="muted.500" />
                <Text alignSelf="center" color="muted.900">
                  SPR is already configured
                </Text>
              </HStack>

              <Button
                mt={8}
                alignSelf="center"
                rounded="full"
                colorScheme="yellow"
                bg="#fbc658"
                _hover={{
                  bg: '#fab526'
                }}
                px={8}
                href="/auth/login"
              >
                Click here to login
              </Button>
            </>
          ) : (
            <>
              <FormControl isInvalid={'ssid' in errors}>
                <FormControl.Label>Wifi Name (SSID)</FormControl.Label>
                <Input
                  value={ssid}
                  placeholder="Name of your Wireless Network"
                  onValueChange={(value) => setSsid(value)}
                />
              </FormControl>
              <FormControl isInvalid={'country' in errors}>
                <FormControl.Label>Wifi Country Code</FormControl.Label>
                <Select
                  selectedValue={countryWifi}
                  onValueChange={(value) => setCountryWifi(value)}
                >
                  <Select.Item label="US" value="US" />
                  <Select.Item label="SE" value="SE" />
                </Select>
              </FormControl>

              <FormControl isInvalid={'wifi' in errors}>
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
                <FormControl.Label>
                  Uplink Interface (Internet)
                </FormControl.Label>
                <Select
                  selectedValue={interfaceUplink}
                  onValueChange={(value) => setInterfaceUplink(value)}
                >
                  <Select.Item label="eth0" value="eth0" />
                  <Select.Item label="wlan0" value="wlan0" />
                  <Select.Item label="wlan1" value="wlan1" isDisabled />
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
            </>
          )}
        </VStack>
      </Box>
    </View>
  )
}

export default Setup
