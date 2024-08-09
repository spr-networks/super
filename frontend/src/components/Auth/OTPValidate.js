import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'

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

const OTPValidate = ({ onSuccess, ...props }) => {
  const navigate = useNavigate()
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
      .catch((err) => {
        setErrors({ validate: 'Invalid OTP Code' })
      })
  }

  const handleClickOTP = () => {
    otp(code)
  }

  useEffect(() => {
    authAPI
      .statusOTP()
      .then((res) => {
        setStatus(res.State)
      })
      .catch((err) => {})

    if (!code.length) {
      setErrors({})
    }
  }, [code])

  if (status == 'unregistered') {
    return (
      <VStack space="md">
        <Text>Need to setup OTP auth for this feature</Text>
        <Button
          variant="outline"
          onPress={() => {
            navigate('/admin/auth')
            onSuccess() // only to close the modal
          }}
        >
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
            <FormControlErrorText>Invalid Code</FormControlErrorText>
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
  onSuccess: PropTypes.func.isRequired
}

export default OTPValidate
