import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'

import { Box, Button, HStack, Stack, Text, View, VStack } from 'native-base'

const WifiConnect = (props) => {
  const context = useContext(AlertContext)
  const { device } = props
  const navigate = useNavigate()

  const [success, setSuccess] = useState(false)
  const [ssids, setSsids] = useState([])
  const [connectQRs, setConnectQRs] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    // fetch ap name
    wifiAPI.interfaces('AP').then((ifaces) => {

      Promise.all(ifaces.map(iface => {
        return wifiAPI
          .status(iface)
          .then((status) => {
            return status['ssid[0]']
          })
      })).then(results => {
        let qrs = {}
        results.map(ssid => {
          qrs[ssid] = generateQRCode(ssid, device.PSKEntry.Psk, device.PSKEntry.Type)
        })
        setConnectQRs(qrs)
        setSsids(results)
      })
    }).catch((err) => {
      setError('could not find wireless interfaces -- check wifid service logs')
    })
  }, [])


  // set qrcode
  const generateQRCode = (_ssid, password, type, hidden = false) => {
    type = 'WPA' //type.toUpperCase()
    return `WIFI:S:${_ssid};P:${password};T:${type};${hidden};`
  }



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
    <VStack>
    {ssids.map((ssid) => (
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
              w="40%"
              variant="solid"
              colorScheme="success"
              bg="green.500"
              onPress={() => navigate('/admin/devices')}
            >
              Success
            </Button>
          ) : (
            <>
              {error ? (
                <Text key="err" color="danger.500">
                  Error: {error}
                </Text>
              ) : (
                <Button key="wait" variant="subtle" colorScheme="muted.100">
                  Waiting for connection...
                </Button>
              )}
            </>
          )}

          {connectQRs[ssid] ? (
            <Box bg="white" p={4}>
              <QRCode value={connectQRs[ssid]} />
            </Box>
          ) : null}

          <Button
            w="1/3"
            variant="ghost"
            colorScheme="muted.800"
            leftIcon={<Icon icon={faArrowLeft} />}
            onPress={goBack}
          >
            Back
          </Button>
        </Stack>
      )
    )}
    </VStack>
  )
}

export default WifiConnect
