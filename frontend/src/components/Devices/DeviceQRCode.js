import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import QRCode from 'react-qr-code'

import { Box } from '@gluestack-ui/themed'

// NOTE issues with type on ios: wpa2 vs wpa3, WPA try both
const generateQRCode = (_ssid, password, type, hidden = false) => {
  type = 'WPA' //type.toUpperCase()
  return `WIFI:S:${_ssid};P:${password};T:${type};${hidden};`
}

// note can have multiple ssids
const DeviceQRCode = ({ ssid, psk, type, ...props }) => {
  const [value, setValue] = useState(null)

  useEffect(() => {
    //device.PSKEntry.Psk, device.PSKEntry.Type
    let value = generateQRCode(ssid, psk, type)
    setValue(value)
  }, [ssid, psk, type])

  if (!value) {
    return <></>
  }

  return (
    <Box bg="$white" p="$4" {...props}>
      <QRCode value={value} />
    </Box>
  )
}

//<DeviceQRCode psk={device.PSKEntry.Psk} type={device.PSKEntry.Type} ssid={ssid} />

DeviceQRCode.propTypes = {
  //device: PropTypes.object.isRequired,
  psk: PropTypes.string.isRequired,
  type: PropTypes.string,
  ssid: PropTypes.string.isRequired
}

export default DeviceQRCode
