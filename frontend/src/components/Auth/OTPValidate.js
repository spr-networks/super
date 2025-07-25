import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { authAPI, setJWTOTPHeader } from 'api'

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
            onChangeText={(value) => setCode(value)}
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
    </VStack>
  )
}

OTPValidate.propTypes = {
  onSuccess: PropTypes.func.isRequired,
  onSetup: PropTypes.func,
  isLogin: PropTypes.bool
}

export default OTPValidate
