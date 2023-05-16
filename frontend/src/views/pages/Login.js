import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { saveLogin, testLogin, getApiURL, setApiURL, getApiHostname } from 'api'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faKey, faServer, faUser } from '@fortawesome/free-solid-svg-icons'
import Icon from 'FontAwesomeUtils'
import { api } from 'api'

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
  useColorModeValue
} from 'native-base'

const Login = (props) => {
  const navigate = useNavigate()

  const [hostname, setHostname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedin] = useState(false)
  const [errors, setErrors] = React.useState({})

  const doLogin = (username, password) => {
    testLogin(username, password, async (success) => {
      if (success) {
        await saveLogin(username, password)
        setLoggedin(true)
        setErrors({})
        navigate('/admin/home')
      } else {
        setErrors({ login: true })
      }
    })
  }

  const handleLogin = () => {
    if (Platform.OS !== 'web') {
      let url = `http://${hostname}/`
      if (hostname.match(/mock|test/g)) {
        url = 'mock'
      }

      setApiURL(url)
    }

    doLogin(username, password)
  }

  useEffect(() => {
    let hostname = getApiHostname()
    setHostname(hostname)

    api
      .get('/setup')
      .then((res) => {
        //set up is not done yet, redirect
        navigate('/auth/setup')
      })
      .catch(async (err) => {
        if (err.response) {
          let msg = await err.response.text() // setup already done
        }
      })

    AsyncStorage.getItem('user').then((login) => {
      login = JSON.parse(login)
      if (login) {
        setUsername(login.username)
        setPassword(login.password)
        //doLogin(login.username, login.password)
      }
    })
  }, [])

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
          Login
        </Heading>
        <VStack space={4} mt={12}>
          <FormControl
            display={{ base: Platform.OS === 'web' ? 'none' : 'flex' }}
          >
            <Input
              type="text"
              value={hostname}
              autoCapitalize="none"
              variant="outline"
              size="md"
              InputLeftElement={
                <Icon icon={faServer} size={4} ml={2} color="muted.400" />
              }
              placeholder="Hostname..."
              onChangeText={(value) => setHostname(value)}
            />
          </FormControl>
          <FormControl>
            {/*<FormControl.Label>Username</FormControl.Label>*/}
            <Input
              type="text"
              value={username}
              autoCapitalize="none"
              variant="outline"
              size="md"
              InputLeftElement={
                <Icon icon={faUser} size={4} ml={2} color="muted.400" />
              }
              placeholder="Username..."
              onChangeText={(value) => setUsername(value)}
            />
          </FormControl>
          <FormControl isInvalid={'login' in errors}>
            {/*<FormControl.Label>Password</FormControl.Label>*/}
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
              onSubmitEditing={handleLogin}
            />
            {'login' in errors ? (
              <FormControl.ErrorMessage
                _text={{
                  fontSize: 'xs'
                }}
              >
                Invalid Password
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
            onPress={handleLogin}
          >
            Login
          </Button>
        </VStack>
      </Box>
    </View>
  )
}

export default Login
