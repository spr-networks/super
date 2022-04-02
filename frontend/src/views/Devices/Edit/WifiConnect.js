import React, { useState, useEffect, useRef } from 'react';
import classnames from "classnames";
import { useHistory } from "react-router-dom";
import QRCode from 'react-qr-code'

// reactstrap components
import { Button, Row, Col, Label } from "reactstrap";
import { pendingPSK, setPSK, hostapdStatus } from "components/Helpers/Api.js";

const Step2 = React.forwardRef((props, ref) => {
  let wifi = props.wizardData["WiFi Configuration"]
  let history = useHistory();

  const [passphraseText, setPassphraseText] = React.useState("")
  const [success, setsuccess] = React.useState(<Label> Pending... </Label>)
  const [done, setdone] = React.useState(false)
  const [ssid, setSsid] = React.useState("")
  const [connectQR, setConnectQR] = React.useState("")

  React.useEffect(() => {
    // fetch ap name
    hostapdStatus().then(status => {
      setSsid(status['ssid[0]'])
    }).catch(error => {
    })
  })

  let checkPendingStatus = () => {
    pendingPSK().then((value) => {
      if (value == false) {
        setsuccess(<Button color="success">Success</Button>)
        setdone(true)
      }
    }).catch( (error) => {
      console.log("error")
      console.log(error)
    })
  }

  React.useEffect(() => {
    const id = setInterval(checkPendingStatus, 1000);
    return () => clearInterval(id)
  }, [1000]);


  if (wifi && !wifi.submitted()) {
    wifi.setsubmitted(true)
    let psk_was_empty = (wifi.psk == "")
    if (!psk_was_empty) {
      setPassphraseText(wifi.psk)
    }

    // set qrcode
    //
    const generateQRCode = (_ssid, password, type, hidden=false) => {
      type = type.toUpperCase()//.replace(/SAE/, 'WPA3')
      //"WIFI:S:SSID;password,type,hidden
      return `WIFI:S:${_ssid};P:${password};T:${type};H:${hidden}`
    }

    if (ssid.length) {
      setConnectQR(generateQRCode(ssid, wifi.psk, wifi.wpa))
    }

    //now submit to the API
    setPSK(wifi.mac, wifi.psk, wifi.wpa, wifi.name).then((value) => {
      setsuccess(<Label> Waiting for connection... </Label>)
      if (psk_was_empty) {
        setPassphraseText(value.Psk)
      }
      //useInterval(f, 1000);

    }).catch((error) => {
      console.log("error")
      console.log(error)
    })

  }

  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      return isValidated();
    },
    state: {
    },
  }));

  const isValidated = () => {
    //wait for a device to have connected (?)
    if (done) {
      history.push("/admin/devices")
    }
    return done
  };

  return (
    <>
      {ssid ? (
      <h5 className="info-text">SSID: {ssid}</h5>
      ) : (null)}
      <h5 className="info-text">Passphrase: {passphraseText}</h5>
      <Row className="justify-content-center">
        <Col lg="1">
          <Row>
            {success}
          </Row>
        </Col>
      </Row>
      {connectQR ? (
      <Row className="justify-content-center text-center">
        <Col lg="6">
          <h4 className="text-muted">Scan QR</h4>
          <QRCode value={connectQR} />
        </Col>
      </Row>
      ) : (null)}
    </>
  );
});

export default Step2;
