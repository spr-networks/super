import React from 'react'
import { useState } from 'react'
import { saveLogin, testLogin } from 'api'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faKey, faUser } from '@fortawesome/free-solid-svg-icons'

import {
  Box,
  Button,
  Center,
  Text,
  View,
  Heading,
  HStack,
  Icon,
  VStack,
  FormControl,
  Input,
  useColorModeValue
} from 'native-base'

const Login = (props) => {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedin] = useState(false)
  const [errors, setErrors] = React.useState({})

  const handleLogin = () => {
    testLogin(username, password, function (success) {
      if (success) {
        saveLogin(username, password)
        setLoggedin(true)
        setErrors({})
        navigate('/admin/home')
      } else {
        setErrors({ login: true })
      }
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
          Login
        </Heading>
        <VStack space={4} mt={12}>
          <FormControl>
            {/*<FormControl.Label>Username</FormControl.Label>*/}
            <Input
              type="text"
              value={username}
              variant="outline"
              size="md"
              InputLeftElement={
                <Icon
                  as={<Icon as={FontAwesomeIcon} icon={faUser} />}
                  size={4}
                  mx="2"
                  color="muted.500"
                />
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
                <Icon
                  as={<Icon as={FontAwesomeIcon} icon={faKey} />}
                  size={4}
                  mx="2"
                  color="muted.500"
                />
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
