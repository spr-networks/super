import React, { useContext, useEffect, useState } from 'react'
import { AlertContext } from 'layouts/Admin'
import { authAPI, setJWTOTPHeader } from 'api'
import QRCode from 'react-qr-code'

import {
  Box,
  Button,
  ButtonText,
  ButtonGroup,
  Checkbox,
  CheckboxIcon,
  CheckboxLabel,
  CheckboxIndicator,
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


const OTPSettings = (props) => {
  const [status, setStatus] = useState('not configured')
  const [qrCode, setQrCode] = useState(null)
  const [code, setCode] = useState("")
  const [alwaysOn, setAlwaysOn] = useState(false)

  const context = useContext(AlertContext)

  useEffect(() => {
    getStatus()
  }, [])

  const getStatus = () => {
    authAPI.statusOTP().then((status) => {
      setStatus(status.State)
      setAlwaysOn(status.AlwaysOn)
    }).catch((e) => {
      setStatus("unknown")
      context.error("failed to get status")
    })
  }

  const register = (e) => {
    authAPI.registerOTP(code).then((res) => {
      for (let user of res.OTPUsers) {
        if (user.Name == "admin") {
          if (user.Secret) {
            setQrCode(generateQRCode(user.Secret))
            setStatus("registered")
          }
        }
      }
    }).catch((err) => {
      setStatus("failed")
      context.error("Could not register. Already registered?")
    })
  }

  const otp = (e) => {
    let username = 'admin'
    authAPI.validateOTP(code, true, alwaysOn).then((res) => {
      setJWTOTPHeader(res)
      context.success("OTP Validated")
    })
    .catch((err) => {
      context.error("Invalid OTP Code")
    })
  }

  const handleClickRegister = () => {
    register()
  }

  const handleClickOTP = () => {
    otp(code)
  }

  const generateQRCode = (secret, hidden = false) => {
    return `otpauth://totp/Auth?secret=${secret}&issuer=SPR-OTP`
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
          <Input w="$1/4">
            <InputField
              name="OTP"
              value={code}
              onChangeText={(value) => setCode(value)}
            />
          </Input>

          <Button action="primary" onPress={handleClickRegister}>
            <ButtonText>Register OTP</ButtonText>
          </Button>

          <Button action="secondary" onPress={handleClickOTP}>
            <ButtonText>Verify OTP Code</ButtonText>
          </Button>

          <Checkbox
            value={alwaysOn}
            onChange={setAlwaysOn}
            isChecked={alwaysOn}>
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Require For Login (Verify to set)</CheckboxLabel>
          </Checkbox>

        </ButtonGroup>
      </Box>
      {qrCode ? (
        <Box bg="$white" p="$4">
          <QRCode value={qrCode} />
        </Box>
      ) : null}

    </View>
  )
}

export default OTPSettings
