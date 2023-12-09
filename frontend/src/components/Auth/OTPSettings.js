import React, { useContext, useState } from 'react'
import { AlertContext } from 'layouts/Admin'
import { authAPI } from 'api'

import {
  Box,
  Button,
  ButtonText,
  ButtonGroup,
  Text,
  View
} from '@gluestack-ui/themed'

import { api } from 'api'
import { Base64 } from 'utils'
import { ListHeader } from 'components/List'

let ApiBaseUrl = api.baseURL
let TOKEN = ''


const OTPSettings = (props) => {
  const [status, setStatus] = useState('not configured')
  const context = useContext(AlertContext)

  const register = (e) => {
    return new Promise((resolve, reject) => {
      let username = 'admin'

      authAPI.registerOTP().then((res) => {

      }).catch((err) => {
        context.error(error.message)
      })
    })
  }

  const otp = (e) => {
    let username = 'admin'
    return new Promise((resolve, reject) => {
      fetch(`${ApiBaseUrl}otp?username=${username}`, {
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

  const handleClickRegister = () => {
    register()
      .then((status) => {
        setStatus(status)
      })
      .catch((error) => {
        console.error('failed to register: ' + error)
      })
  }

  const handleClickOTP = () => {
    otp()
      .then((status) => {
        setStatus(status)
      })
      .catch((error) => {
        console.error('failed to login: ' + error)
      })
  }

  return (
    <View>
      <ListHeader title="OTP Settings">
        <Text
          marginLeft="auto"
          pt="$2"
          color={status.startsWith('success') ? '$success500' : '$muted500'}
        >
          {status}
        </Text>
      </ListHeader>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
        mb="$4"
      >
        <ButtonGroup size="md">
          <Button action="primary" onPress={handleClickRegister}>
            <ButtonText>Register OTP</ButtonText>
          </Button>

          <Button action="secondary" onPress={handleClickOTP}>
            <ButtonText>Verify OTP Code</ButtonText>
          </Button>
        </ButtonGroup>
      </Box>
    </View>
  )
}

export default OTPSettings
