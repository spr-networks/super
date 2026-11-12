import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { api, authAPI, setJWTOTPHeader } from 'api'
import { isPasskeySupported, validatePasskey } from 'api/Passkey'
import { normalizeTextInput } from 'utils/normalizeTextInput'

import {
  AlertCircleIcon,
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  Input,
  InputField,
  Text,
  VStack
} from '@gluestack-ui/themed'

const OTPValidate = ({ onSuccess, onSetup, isLogin, ...props }) => {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')
  const [errors, setErrors] = useState({})
  const [canUsePasskey, setCanUsePasskey] = useState(!!isLogin)

  useEffect(() => {
    if (isLogin || !isPasskeySupported()) return
    api
      .get('/webauthn/status')
      .then((res) =>
        setCanUsePasskey((res?.Credentials || []).some((c) => c.Attested))
      )
      .catch(() => {})
  }, [])

  const otp = (e) => {
    authAPI
      .validateOTP(code)
      .then(async (res) => {
        setJWTOTPHeader(res)
        setErrors({})

        onSuccess()
      })
      .catch(async (err) => {
        let errorMessage = 'Invalid OTP Code'
        
        // Extract the actual error message from the backend
        if (err.response) {
          try {
            const errorText = await err.response.text()
            if (errorText) {
              errorMessage = errorText
            }
          } catch (e) {
            // If we can't read the response, use the default message
          }
        } else if (err.message) {
          errorMessage = err.message
        }
        
        setErrors({ validate: errorMessage })
      })
  }

  const handleClickOTP = () => {
    otp(code)
  }

  const handleClickPasskey = () => {
    validatePasskey()
      .then((res) => {
        setJWTOTPHeader(res)
        setErrors({})

        onSuccess()
      })
      .catch(async (err) => {
        let errorMessage = 'Passkey validation failed'
        try {
          const errorText = await err?.response?.text()
          if (errorText?.includes('no hardware-backed passkeys')) {
            errorMessage =
              'No hardware-backed passkey registered. Synced passkeys can only be used to log in.'
          }
        } catch (e) {}
        setErrors({ validate: errorMessage })
      })
  }

  useEffect(() => {
    if (!isLogin) {
      authAPI
        .statusOTP()
        .then((res) => {
          setStatus(res.State)
        })
        .catch((err) => {})

      if (!code.length) {
        setErrors({})
      }
    } else {
      setStatus("registered") //assume registered on logins
    }
  }, [code])

  if (status == 'unregistered') {
    return (
      <VStack space="md">
        <Text>Need to setup OTP auth for this feature</Text>
        <Button variant="outline" onPress={onSetup}>
          <ButtonText>Setup OTP</ButtonText>
        </Button>
      </VStack>
    )
  }

  return (
    <VStack space="md">
      <FormControl isInvalid={'validate' in errors}>
        <Input>
          <InputField
            autoFocus
            name="OTP"
            value={code}
            onChangeText={(value) => setCode(normalizeTextInput(value))}
            onSubmitEditing={handleClickOTP}
          />
        </Input>
        {'validate' in errors ? (
          <FormControlError>
            <FormControlErrorIcon as={AlertCircleIcon} />
            <FormControlErrorText>{errors.validate}</FormControlErrorText>
          </FormControlError>
        ) : null}
      </FormControl>
      <FormControl>
        <Button action="primary" onPress={handleClickOTP}>
          <ButtonText>Verify OTP Code</ButtonText>
        </Button>
      </FormControl>
      {isPasskeySupported() && canUsePasskey ? (
        <FormControl>
          <Button
            action="secondary"
            variant="outline"
            onPress={handleClickPasskey}
          >
            <ButtonText>Use Passkey Instead</ButtonText>
          </Button>
        </FormControl>
      ) : null}
    </VStack>
  )
}

OTPValidate.propTypes = {
  onSuccess: PropTypes.func.isRequired,
  onSetup: PropTypes.func,
  isLogin: PropTypes.bool
}

export default OTPValidate
