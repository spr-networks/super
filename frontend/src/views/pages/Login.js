import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  saveLogin,
  saveTokenLogin,
  testLogin,
  setApiURL,
  getApiHostname,
  isMockAPI,
  api
} from 'api'
import { isPasskeySupported, loginPasskey } from 'api/Passkey'
import { getBiometryType, saveSecureLogin, loadSecureLogin } from 'api/SecureStore'
import { useNavigate } from 'react-router-dom'

import {
  Box,
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  Heading,
  Icon,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Link,
  LinkText,
  Text,
  VStack,
  useColorMode,
  GlobeIcon,
  LockIcon,
  AlertCircleIcon,
  HStack
} from '@gluestack-ui/themed'
import { InfoIcon } from 'lucide-react-native'

const Login = (props) => {
  const navigate = useNavigate()
  //TODO for desktop get location.protocol

  const [hostname, setHostname] = useState('')
  const [protocol, setProtocol] = useState('http:') //for iOS, TODO show msg if http & have https + cert install
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = React.useState({})
  const [biometryType, setBiometryType] = useState(null)
  const [secureLogin, setSecureLogin] = useState(false)

  const doLogin = (username, password) => {
    testLogin(username, password, async (success) => {
      if (success) {
        let secure = Platform.OS != 'web' && biometryType
        if (secure)
          secure = await saveSecureLogin({ username, password, hostname, protocol })
            .then(() => true).catch(() => false)

        await saveLogin(username, password, hostname, protocol, secure)
        setErrors({})
        navigate('/admin/home')
      } else {
        if (
          hostname.length &&
          !hostname.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)|(spr\.local)$/)
        ) {
          setErrors({ hostname: true })
        } else {
          setErrors({ login: true })
        }
      }
    })
  }

  const handleBiometricUnlock = async () => {
    //user cancel or biometry failure throws
    let creds = await loadSecureLogin().catch(() => null)
    if (!creds) {
      return
    }

    if (creds.hostname)
      setApiURL(`${creds.protocol || protocol}//${creds.hostname}/`)

    testLogin(creds.username, creds.password, async (success) => {
      if (success) {
        await saveLogin(creds.username, creds.password, creds.hostname, creds.protocol, true)
        setErrors({})
        navigate('/admin/home')
      } else {
        setErrors({ login: true })
      }
    })
  }

  const handlePasskeyLogin = async () => {
    try {
      let res = await loginPasskey()
      await saveTokenLogin(res.Name || 'admin', res.Token, hostname, protocol)
      setErrors({})
      navigate('/admin/home')
    } catch (err) {
      setErrors({ login: true })
    }
  }

  const handleLogin = () => {
    if (Platform.OS !== 'web') {
      //TODO use URL to set/parse
      let url = `${protocol}//${hostname}/`
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

    //NOTE useLocation dont have .protocol
    if (Platform.OS == 'web') {
      setProtocol(window?.location?.protocol == 'https:' ? 'https:' : 'http:')
    } else {
      getBiometryType().then(setBiometryType)
    }

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

    if (isMockAPI()) {
      //mock backend only accepts admin:admin, prefill it
      setUsername('admin')
      setPassword('admin')
    }

    AsyncStorage.getItem('user').then((login) => {
      login = JSON.parse(login)

      if (login?.secure) setSecureLogin(true)

      if (login?.username) {
        setUsername(login.username)
        setPassword(login.password || '')

        //hostname, protocol only for mobile
        if (Platform.OS != 'web') {
          if (login.hostname) {
            setHostname(login.hostname)
          }

          if (login.protocol?.match(/^http?s:/g)) {
            setProtocol(login.protocol)
          }
        }
      }
    })
  }, [])

  const switchProtocol = () =>
    setProtocol(protocol == 'https:' ? 'http:' : 'https:')

  const colorMode = useColorMode()

  return (
    <VStack
      px="$4"
      py="$8"
      sx={{
        '@base': { h: '$full', w: '$full', mt: '$1/4' },
        '@md': {
          h: 'auto',
          w: '$1/4',
          mt: '8vh',
          alignSelf: 'center',
          rounded: 10
        }
      }}
      bg={colorMode === 'light' ? 'white' : '$blueGray900'}
    >
      <VStack space="lg" flex={2}>
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
          isInvalid={'hostname' in errors}
          sx={{
            '@base': { display: Platform.OS === 'web' ? 'none' : 'flex' }
          }}
        >
          <Input>
            <InputSlot>
              <Button variant="link" pl="$3" onPress={switchProtocol}>
                <ButtonText
                  color={protocol == 'https:' ? '$success500' : '$muted500'}
                >
                  {protocol}//
                </ButtonText>
              </Button>
            </InputSlot>
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
          {'hostname' in errors ? (
            <FormControlError>
              <FormControlErrorIcon as={AlertCircleIcon} />
              <FormControlErrorText>Invalid IP address</FormControlErrorText>
            </FormControlError>
          ) : null}
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
              autoCapitalize="none"
              autoCorrect={false}
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
          rounded="$full"
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
        {isPasskeySupported() ? (
          <Button
            rounded="$full"
            variant="outline"
            action="secondary"
            onPress={handlePasskeyLogin}
          >
            <ButtonText>Sign in with Passkey</ButtonText>
          </Button>
        ) : null}
        {Platform.OS != 'web' && secureLogin && biometryType ? (
          <Button
            rounded="$full"
            variant="outline"
            action="secondary"
            onPress={handleBiometricUnlock}
          >
            <ButtonText>Unlock Secure Login</ButtonText>
          </Button>
        ) : null}
      </VStack>

      <VStack flex={1} display={Platform.OS != 'web' ? 'flex' : 'none'}>
        <Button
          variant="outline"
          action={protocol == 'http:' ? 'positive' : 'secondary'}
          size="xs"
          onPress={switchProtocol}
        >
          <ButtonText>
            Switch to {protocol == 'https:' ? 'http:' : 'https:'}
          </ButtonText>
        </Button>
        {Platform.OS != 'web' && protocol == 'http:' ? (
          <VStack mt="$2" space="md" alignItems="center">
            <HStack space="sm">
              <Icon as={InfoIcon} />
              <Text size="sm">
                https not selected, verify WiFi is connected to SPR
              </Text>
            </HStack>
            <HStack w="$full" space="md" justifyContent="space-evenly">
              <Link href="http://spr.local/cert">
                <LinkText size="sm">Download Certificate</LinkText>
              </Link>
              <Link
                href="https://www.supernetworks.org/pages/docs/development/apis/ssl_support#install-ca-certificate-on-ios"
                isExternal
              >
                <LinkText size="sm">How to install Certificate</LinkText>
              </Link>
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  )
}

export default Login
