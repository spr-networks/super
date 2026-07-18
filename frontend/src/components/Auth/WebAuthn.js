import React, { useContext, useEffect, useState } from 'react'
import { AlertContext } from 'layouts/Admin'

import {
  Box,
  Button,
  ButtonText,
  HStack,
  Input,
  InputField,
  Text,
  View,
  VStack
} from '@gluestack-ui/themed'

import { api } from 'api'
import { isPasskeySupported, registerPasskey } from 'api/Passkey'
import { ListHeader } from 'components/List'

const WebAuthn = (props) => {
  const [credentials, setCredentials] = useState([])
  const [name, setName] = useState('')

  const context = useContext(AlertContext)

  const getStatus = () =>
    api
      .get('/webauthn/status')
      .then((status) => setCredentials(status.Credentials || []))
      .catch(() => context.error('failed to get passkey status'))

  useEffect(() => {
    getStatus()
  }, [])

  const handleClickRegister = () =>
    registerPasskey(name.length ? name : 'passkey')
      .then((status) => {
        setName('')
        setCredentials(status.Credentials || [])
        context.success('Passkey registered')
      })
      .catch(() => context.error('failed to register passkey'))

  const handleClickDelete = (credential) =>
    api
      .delete('/webauthn/credential', { ID: credential.ID })
      .then(getStatus)
      .catch(() => context.error('failed to remove passkey'))

  if (!isPasskeySupported()) {
    return <></>
  }

  return (
    <View>
      <ListHeader title="Passkeys">
        <Text marginLeft="auto" pt="$2" color="$muted500">
          {credentials.length
            ? `${credentials.length} registered`
            : 'not configured'}
        </Text>
      </ListHeader>

      <Box bg="$backgroundCardLight" sx={{ _dark: { bg: '$backgroundCardDark' } }} p="$4" mb="$4">
        <VStack space="md">
          {credentials.map((credential) => (
            <HStack key={credential.ID} space="md" alignItems="center">
              <Text flex={1}>{credential.Name}</Text>
              <Button
                action="negative"
                variant="link"
                size="sm"
                onPress={() => handleClickDelete(credential)}
              >
                <ButtonText>Remove</ButtonText>
              </Button>
            </HStack>
          ))}

          <HStack space="md">
            <Input flex={1}>
              <InputField
                value={name}
                onChangeText={(value) => setName(value)}
                placeholder="Passkey name"
                autoCapitalize="none"
              />
            </Input>
            <Button action="primary" onPress={handleClickRegister}>
              <ButtonText>Add Passkey</ButtonText>
            </Button>
          </HStack>

          <Text size="sm" color="$muted500">
            Passkeys can be used instead of OTP codes and for logging in
          </Text>
        </VStack>
      </Box>
    </View>
  )
}

export default WebAuthn
