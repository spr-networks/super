import React from 'react'
import { useState } from 'react'
import { saveLogin, testLogin } from 'api'
import { useNavigate } from 'react-router-dom'

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

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
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
        p={8}
        w="90%"
        maxW={360}
        bg={useColorModeValue('white', 'blueGray.900')}
        rounded={10}
        shadow={2}
      >
        <Heading
          size="lg"
          fontWeight="600"
          color="coolGray.800"
          _dark={{
            color: 'warmGray.50'
          }}
        >
          Login
        </Heading>
        <VStack space={3} mt="5">
          <FormControl>
            <FormControl.Label>Username</FormControl.Label>
            <Input
              type="text"
              value={username}
              onChangeText={(value) => setUsername(value)}
            />
          </FormControl>
          <FormControl isInvalid={'login' in errors}>
            <FormControl.Label>Password</FormControl.Label>
            <Input
              type="password"
              value={password}
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
          <Button mt="2" colorScheme="primary" onPress={handleLogin}>
            Login
          </Button>
        </VStack>
      </Box>
    </View>
  )
}

export default Login
