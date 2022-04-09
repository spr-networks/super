import React, { useState, useEffect } from 'react'
import { Link, useHistory } from 'react-router-dom'
import QRCode from 'react-qr-code'

import { Button, Row, Col, Label } from 'reactstrap'
import { deviceAPI, wifiAPI } from 'api'

const Step2 = React.forwardRef((props, ref) => {
  let wifi = props.wizardData['WiFi Configuration']
  let history = useHistory()

  const [passphraseText, setPassphraseText] = useState('')
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

  let checkPendingStatus = () => {
    deviceAPI
      .pendingPSK()
      .then((gotPending) => {
        setSuccess(gotPending === false)
      })
      .catch((error) => {
        console.log('error:', error)
        setError(error.message)
      })
  }

  useEffect(() => {
    const id = setInterval(checkPendingStatus, 1000)
    return () => clearInterval(id)
  }, [1000])

  if (wifi && !wifi.submitted()) {
    wifi.setsubmitted(true)
    let psk_was_empty = wifi.psk == ''
    if (!psk_was_empty) {
      setPassphraseText(wifi.psk)
    }

    // set qrcode
    //
    const generateQRCode = (_ssid, password, type, hidden = false) => {
      type = type.toUpperCase() //.replace(/SAE/, 'WPA3')
      //"WIFI:S:SSID;password,type,hidden
      //return `WIFI:S:${_ssid};P:${password};T:${type};H:${hidden}`
      return `WIFI:S:${_ssid};P:${password};T:WPA;false;`
    }

    let data = {
      MAC: wifi.mac || 'pending',
      Name: wifi.name,
      Zones: wifi.zones,
      PSKEntry: {
        Psk: wifi.psk,
        Type: wifi.wpa
      }
    }

    //now submit to the API
    deviceAPI
      .update(data)
      .then((value) => {
        if (psk_was_empty) {
          data.PSKEntry.Psk = value.PSKEntry.Psk
          setPassphraseText(value.PSKEntry.Psk)
        }

        if (ssid.length) {
          setConnectQR(
            generateQRCode(ssid, data.PSKEntry.Psk, data.PSKEntry.Type)
          )
        }
      })
      .catch((error) => {
        setError(error.message)
      })
  }

  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      return isValidated()
    },
    state: {}
  }))

  const isValidated = () => {
    //wait for a device to have connected (?)
    if (success) {
      history.push('/admin/devices')
    }
    return success
  }

  return (
    <>
      {ssid ? <h5 className="info-text">SSID: {ssid}</h5> : null}
      <h5 className="info-text">Passphrase: {passphraseText}</h5>
      <Row>
        <Col md="12" className="text-center">
          {success ? (
            <Link to="/admin/devices">
              <Button color="success">Success</Button>
            </Link>
          ) : (
            <>
              {error ? (
                <Label className="text-danger">Error: {error}</Label>
              ) : (
                <Label>Waiting for connection...</Label>
              )}
            </>
          )}
        </Col>
      </Row>
      {connectQR ? (
        <Row className="justify-content-center text-center">
          <Col lg="6">
            <h4 className="text-muted">Scan QR</h4>
            <QRCode value={connectQR} />
          </Col>
        </Row>
      ) : null}
    </>
  )
})

export default Step2
