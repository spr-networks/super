import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { saveLogin, testLogin, setApiURL, getApiHostname } from 'api'
import { useNavigate } from 'react-router-dom'

import { api } from 'api'

import {
  Box,
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Heading,
  View,
  VStack,
  useColorMode,
  GlobeIcon,
  LockIcon,
  AlertCircleIcon
} from '@gluestack-ui/themed'

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
        await saveLogin(username, password, hostname)
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

        if (login.hostname) {
          setHostname(login.hostname)
        }
      }
    })
  }, [])

  const colorMode = useColorMode()

  return (
    <Box
      px="$4"
      py="$8"
      sx={{
        '@base': { w: '$full', mt: '$1/4' },
        '@md': { w: '$1/4', mt: '$0', alignSelf: 'center', rounded: 10 }
      }}
      bg={colorMode === 'light' ? 'white' : '$blueGray900'}
    >
      <VStack space="lg">
        <Heading
          alignSelf="center"
          size="lg"
          fontWeight="300"
          color="$coolGray800"
          sx={{
            _dark: {
              color: '$warmGray50'
            }
          }}
        >
          Login
        </Heading>
        <FormControl
          sx={{
            '@base': { display: Platform.OS === 'web' ? 'none' : 'flex' }
          }}
        >
          <Input>
            <InputField
              value={hostname}
              onChangeText={(value) => setHostname(value)}
              type="text"
              placeholder="Hostname"
              autoCapitalize="none"
            />
            <InputSlot pr="$3">
              <InputIcon as={GlobeIcon} color="$muted400" />
            </InputSlot>
          </Input>
        </FormControl>

        <FormControl>
          <Input>
            <InputField
              value={username}
              onChangeText={(value) => setUsername(value)}
              type="text"
              placeholder="Username"
              autoCapitalize="none"
            />
          </Input>
        </FormControl>

        <FormControl isInvalid={'login' in errors}>
          <Input>
            <InputField
              value={password}
              onChangeText={(value) => setPassword(value)}
              onSubmitEditing={handleLogin}
              type="password"
              placeholder="Password"
            />
            <InputSlot pr="$3">
              <InputIcon as={LockIcon} color="$muted400" />
            </InputSlot>
          </Input>
          {'login' in errors ? (
            <FormControlError>
              <FormControlErrorIcon as={AlertCircleIcon} />
              <FormControlErrorText>Invalid Password</FormControlErrorText>
            </FormControlError>
          ) : null}
        </FormControl>
        <Button
          rounded="full"
          colorScheme="yellow"
          bg="#fbc658"
          sx={{
            ':hover': {
              bg: '#fab526'
            }
          }}
          onPress={handleLogin}
        >
          <ButtonText>Login</ButtonText>
        </Button>
      </VStack>
    </Box>
  )
}

export default Login
