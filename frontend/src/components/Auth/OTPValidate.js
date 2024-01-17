import React, { useContext, useEffect, useState } from 'react'
import { authAPI, setJWTOTPHeader, getAuthReturn } from 'api'
import { useNavigate, useParams } from 'react-router-dom'

import {
  AlertCircleIcon,
  Box,
  Button,
  ButtonText,
  ButtonGroup,
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
import { Base64 } from 'utils'
import { ListHeader } from 'components/List'

let ApiBaseUrl = api.baseURL
let TOKEN = ''

const OTPValidate = (props) => {
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})

  const navigate = useNavigate()

  const otp = (e) => {
    let username = 'admin'
    authAPI
      .validateOTP(code)
      .then((res) => {
        setJWTOTPHeader(res)
        setErrors({})
        getAuthReturn().then((url) => {
          navigate(url)
        })
        navigate('/admin/home')
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
        <Button action="secondary" onPress={handleClickOTP}>
          <ButtonText>Verify OTP Code</ButtonText>
        </Button>
        {'validate' in errors ? (
          <FormControlError>
            <FormControlErrorIcon as={AlertCircleIcon} />
            <FormControlErrorText>Invalid Code</FormControlErrorText>
          </FormControlError>
        ) : null}
      </FormControl>
    </VStack>
  )
}

export default OTPValidate
