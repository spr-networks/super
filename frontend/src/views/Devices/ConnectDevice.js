import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import {
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  HStack,
  Text,
  VStack,
  ArrowLeftIcon
} from '@gluestack-ui/themed'

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
    wifiAPI
      .interfaces('AP')
      .then((ifaces) => {
        Promise.all(
          ifaces.map((iface) => {
            return wifiAPI.status(iface).then((status) => {
              return status['ssid[0]']
            })
          })
        ).then((results) => {
          let qrs = {}
          results.map((ssid) => {
            qrs[ssid] = generateQRCode(
              ssid,
              device.PSKEntry.Psk,
              device.PSKEntry.Type
            )
          })
          setConnectQRs(qrs)
          setSsids(results)
        })
      })
      .catch((err) => {
        setError(
          'could not find wireless interfaces -- check wifid service logs'
        )
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
        <VStack key={ssid} space="md" alignItems="center">
          <HStack space="sm">
            <Text size="lg" color="$muted500">
              SSID
            </Text>
            <Text bold size="lg">
              {ssid}
            </Text>
          </HStack>
          <HStack space="sm">
            <Text size="md" color="$muted500">
              Password
            </Text>
            <Text bold size="md">
              {device.PSKEntry.Psk}
            </Text>
          </HStack>

          {success ? (
            <Button
              w="$2/5"
              action="success"
              variant="solid"
              bg="$green500"
              onPress={() => navigate('/admin/devices')}
            >
              <ButtonText>Success</ButtonText>
            </Button>
          ) : (
            <>
              {error ? (
                <Text key="err" color="$red500">
                  Error: {error}
                </Text>
              ) : (
                <Button key="wait" action="secondary" variant="link">
                  <ButtonText>Waiting for connection...</ButtonText>
                </Button>
              )}
            </>
          )}

          {connectQRs[ssid] ? (
            <Box bg="$white" p="$4">
              <QRCode value={connectQRs[ssid]} />
            </Box>
          ) : null}

          <Button w="$1/3" action="secondary" variant="solid" onPress={goBack}>
            <ButtonIcon as={ArrowLeftIcon} />
            <ButtonText>Back</ButtonText>
          </Button>
        </VStack>
      ))}
    </VStack>
  )
}

export default WifiConnect
