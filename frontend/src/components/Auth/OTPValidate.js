import React, { useState } from 'react'
import { authAPI, setJWTOTPHeader, getAuthReturn } from 'api'
import { useNavigate } from 'react-router-dom'

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
  View,
  VStack
} from '@gluestack-ui/themed'

import { api } from 'api'

const OTPValidate = (props) => {
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})

  const navigate = useNavigate()

  const otp = (e) => {
    authAPI
      .validateOTP(code)
      .then(async (res) => {
        setJWTOTPHeader(res)
        setErrors({})

        let url = '/admin/home'
        try {
          url = await getAuthReturn()
        } catch {
          url = '/admin/home'
        }

        navigate(url)
      })
      .catch((err) => {
        setErrors({ validate: 'Invalid OTP Code' })
      })
  }

  const handleClickOTP = () => {
    otp(code)
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
      </FormControl>
      <FormControl>
        <Button action="primary" onPress={handleClickOTP}>
          <ButtonText>Verify OTP Code</ButtonText>
        </Button>
        {'validate' in errors ? (
          <FormControlError>
            <FormControlErrorIcon as={AlertCircleIcon} />
            <FormControlErrorText>Invalid Code</FormControlErrorText>
          </FormControlError>
        ) : null}
      </FormControl>
      <FormControl>
        <Button
          action="secondary"
          variant="outline"
          onPress={() => navigate(-3)}
        >
          <ButtonText>Back</ButtonText>
        </Button>
      </FormControl>
    </VStack>
  )
}

export default OTPValidate
