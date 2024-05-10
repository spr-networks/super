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
  VStack,
  HStack
} from '@gluestack-ui/themed'

import { api } from 'api'
import { Base64 } from 'utils'
import { ListHeader } from 'components/List'

let ApiBaseUrl = api.baseURL
let TOKEN = ''

const OTPSettings = (props) => {
  const [status, setStatus] = useState('not configured')
  const [qrCode, setQrCode] = useState(null)
  const [code, setCode] = useState('')
  const [alwaysOn, setAlwaysOn] = useState(false)

  const context = useContext(AlertContext)

  useEffect(() => {
    getStatus()
  }, [])

  const getStatus = () => {
    authAPI
      .statusOTP()
      .then((status) => {
        if (status.Confirmed === true) {
          setStatus(status.State)
        }
        setAlwaysOn(status.AlwaysOn)
      })
      .catch((e) => {
        setStatus('unknown')
        context.error('failed to get status')
      })
  }

  const register = (e) => {
    authAPI
      .registerOTP(code)
      .then((res) => {
        for (let user of res.OTPUsers) {
          if (user.Name == 'admin') {
            if (user.Secret) {
              setQrCode(generateQRCode(user.Secret))
              setStatus('validate to set...')
            }
          }
        }
      })
      .catch((err) => {
        setStatus('failed')
        context.error('Could not register. Already registered?')
      })
  }

  const otp = (e) => {
    let username = 'admin'
    authAPI.validateOTP(code, true, alwaysOn).then((res) => {
      setJWTOTPHeader(res)
      context.success("OTP Validated")
      setStatus("registered")
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

  const description = (
    <Text
      marginLeft="auto"
      size="sm"
      color={status.startsWith('registered') ? '$success500' : '$muted500'}
    >
      {status}
    </Text>
  )

  return (
    <View>
      <ListHeader title="OTP Settings" description={description}>
        <HStack space="sm" alignItems="center">
          <Button action="primary" size="sm" onPress={handleClickRegister}>
            <ButtonText>Register OTP</ButtonText>
          </Button>
        </HStack>
      </ListHeader>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
        mb="$4"
      >
        <VStack
          space="md"
          sx={{ '@md': { flexDirection: 'row', width: '$3/5', gap: '$4' } }}
        >
          <Input>
            <InputField
              placeholder="OTP Code"
              name="OTP"
              value={code}
              onChangeText={(value) => setCode(value)}
            />
          </Input>

          <Button action="secondary" onPress={handleClickOTP}>
            <ButtonText>Verify OTP Code</ButtonText>
          </Button>

          <Checkbox
            size="sm"
            value={alwaysOn}
            onChange={setAlwaysOn}
            isChecked={alwaysOn}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Require For Login (Verify to set)</CheckboxLabel>
          </Checkbox>
        </VStack>
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
