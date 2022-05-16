import { useContext, useState } from 'react'

import {
  Box,
  Button,
  Heading,
  HStack,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

import { api } from 'api'

let ApiBaseUrl = api.baseURL
let TOKEN = ''

// Base64 to ArrayBuffer
function bufferDecode(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

// ArrayBuffer to URLBase64
function bufferEncode(value) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const register = (e) => {
  let username = 'admin'

  return new Promise((resolve, reject) => {
    fetch(`${ApiBaseUrl}webauthn/register?username=${username}`, {
      headers: { Authorization: api.getAuthHeaders() }
    })
      .then((res) => res.json())
      .then((credentialCreationOptions) => {
        console.log('creds', credentialCreationOptions)

        TOKEN = credentialCreationOptions.publicKey.extensions['SPR-Bearer']

        credentialCreationOptions.publicKey.challenge = bufferDecode(
          credentialCreationOptions.publicKey.challenge
        )
        credentialCreationOptions.publicKey.user.id = bufferDecode(
          credentialCreationOptions.publicKey.user.id
        )

        if (credentialCreationOptions.publicKey.excludeCredentials) {
          for (
            var i = 0;
            i < credentialCreationOptions.publicKey.excludeCredentials.length;
            i++
          ) {
            credentialCreationOptions.publicKey.excludeCredentials[i].id =
              bufferDecode(
                credentialCreationOptions.publicKey.excludeCredentials[i].id
              )
          }
        }

        return navigator.credentials.create({
          publicKey: credentialCreationOptions.publicKey
        })
      })
      .then((credential) => {
        console.log('navigator credentials=', credential)

        let attestationObject = credential.response.attestationObject
        let clientDataJSON = credential.response.clientDataJSON
        let rawId = credential.rawId

        let body = JSON.stringify({
          id: credential.id,
          rawId: bufferEncode(rawId),
          type: credential.type,
          response: {
            attestationObject: bufferEncode(attestationObject),
            clientDataJSON: bufferEncode(clientDataJSON)
          }
        })

        fetch(`${ApiBaseUrl}webauthn/register?username=${username}`, {
          method: 'POST',
          body,
          headers: {
            Authorization: api.getAuthHeaders(),
            'Content-Type': 'application/json',
            'X-Requested-With': 'react',
            'SPR-Bearer': TOKEN
          }
        })
          .then((res) => res.json())
          .then(resolve)
          .catch(reject)
      })
      .catch((error) => {
        console.log(error)
        console.log('failed to register ' + username)
      })
  })
}

const login = (e) => {
  let username = 'admin'
  return new Promise((resolve, reject) => {
    fetch(`${ApiBaseUrl}login?username=${username}`, {
      headers: { Authorization: api.getAuthHeaders() }
    })
      .then((res) => res.json())
      .then((credentialRequestOptions) => {
        TOKEN = credentialRequestOptions.publicKey.extensions['SPR-Bearer']

        console.log('login TOKEN=', TOKEN)

        credentialRequestOptions.publicKey.challenge = bufferDecode(
          credentialRequestOptions.publicKey.challenge
        )
        credentialRequestOptions.publicKey.allowCredentials.forEach(function (
          listItem
        ) {
          listItem.id = bufferDecode(listItem.id)
        })

        // call into otp provider
        return navigator.credentials.get({
          publicKey: credentialRequestOptions.publicKey
        })
      })
      .then((assertion) => {
        console.log(assertion)

        let authData = assertion.response.authenticatorData
        let clientDataJSON = assertion.response.clientDataJSON
        let rawId = assertion.rawId
        let sig = assertion.response.signature
        let userHandle = assertion.response.userHandle

        let body = JSON.stringify({
          id: assertion.id,
          rawId: bufferEncode(rawId),
          type: assertion.type,
          response: {
            authenticatorData: bufferEncode(authData),
            clientDataJSON: bufferEncode(clientDataJSON),
            signature: bufferEncode(sig),
            userHandle: bufferEncode(userHandle)
          }
        })

        fetch(`${ApiBaseUrl}login?username=${username}`, {
          method: 'POST',
          body,
          headers: { Authorization: `Bearer ${TOKEN}` }
        })
          .then((res) => res.json())
          .then(resolve)
          .catch(reject)
      })
  })
}

const WebAuthn = (props) => {
  const [status, setStatus] = useState('not configured')

  const handleClickRegister = () => {
    register()
      .then((status) => {
        setStatus(status)
      })
      .catch((error) => {
        console.error('failed to register: ' + error)
      })
  }

  const handleClickLogin = () => {
    login()
      .then((status) => {
        setStatus(status)
      })
      .catch((error) => {
        console.error('failed to login: ' + error)
      })
  }

  return (
    <View>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        rounded="md"
        width="100%"
        p={4}
      >
        <HStack space="1" mb="2">
          <Heading fontSize="lg">Webauthn</Heading>

          <Text
            marginLeft="auto"
            pt={2}
            color={status.startsWith('success') ? 'success.500' : 'muted.500'}
          >
            {status}
          </Text>
        </HStack>

        <Button.Group size="md">
          <Button colorScheme="primary" onPress={handleClickRegister}>
            Register Webauthn device
          </Button>

          <Button colorScheme="secondary" onPress={handleClickLogin}>
            Verify Webauthn device
          </Button>
        </Button.Group>
      </Box>
    </View>
  )
}

export default WebAuthn
