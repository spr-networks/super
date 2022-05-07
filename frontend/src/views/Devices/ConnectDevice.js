import React, { useContext, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import QRCode from 'react-qr-code'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'

import { Button, HStack, Icon, Stack, Text, View } from 'native-base'

const WifiConnect = (props) => {
  const context = useContext(AlertContext)
  const { device } = props
  const history = useHistory()

  const [success, setSuccess] = useState(false)
  const [ssid, setSsid] = useState('')
  const [connectQR, setConnectQR] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    // fetch ap name
    wifiAPI
      .status()
      .then((status) => {
        setSsid(status['ssid[0]'])
      })
      .catch((error) => {
        setError(error.message)
      })
  }, [])

  // set qrcode
  const generateQRCode = (_ssid, password, type, hidden = false) => {
    type = 'WPA' //type.toUpperCase()
    return `WIFI:S:${_ssid};P:${password};T:${type};${hidden};`
  }

  useEffect(() => {
    setConnectQR(
      generateQRCode(ssid, device.PSKEntry.Psk, device.PSKEntry.Type)
    )
  }, [ssid])

  const checkPendingStatus = () => {
    deviceAPI
      .pendingPSK()
      .then((gotPending) => {
        setSuccess(gotPending === false)
      })
      .catch((error) => {
        context.error(error.message)
      })
  }

  useEffect(() => {
    const id = setInterval(checkPendingStatus, 1000)
    return () => clearInterval(id)
  }, [1000])

  const goBack = () => {
    if (props.goBack) {
      props.goBack()
    }
  }

  return (
    <View>
      <Stack space={4} alignItems="center">
        <HStack space={1}>
          <Text fontSize="lg" color="muted.500">
            SSID
          </Text>
          <Text bold fontSize="lg">
            {ssid}
          </Text>
        </HStack>
        <HStack space={1}>
          <Text fontSize="md" color="muted.500">
            Password
          </Text>
          <Text bold fontSize="md">
            {device.PSKEntry.Psk}
          </Text>
        </HStack>

        {success ? (
          <Button
            variant="solid"
            colorScheme="success"
            onPress={() => history.push('/admin/devices')}
          >
            Success
          </Button>
        ) : (
          <>
            {error ? (
              <Text color="danger.500">Error: {error}</Text>
            ) : (
              <Button variant="subtle" colorScheme="muted.100">
                Waiting for connection...
              </Button>
            )}
          </>
        )}

        {connectQR ? <QRCode value={connectQR} /> : null}

        <Button
          w="1/3"
          variant="ghost"
          colorScheme="muted.800"
          leftIcon={<Icon as={FontAwesomeIcon} icon={faArrowLeft} />}
          onPress={goBack}
        >
          Back
        </Button>
      </Stack>
    </View>
  )
}

export default WifiConnect
