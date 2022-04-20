import React from 'react'
import PropTypes from 'prop-types'
import QRCode from 'react-qr-code'

import { Button, Col, Row } from 'reactstrap'

const WireguardConfig = (props) => {
  if (!props.config) {
    return <></>
  }

  // TODO - separate stage to its own file
  const configFromJSON = (data) => {
    return `[Interface]
      PrivateKey = ${data.Interface.PrivateKey || '<PRIVATE KEY>'}
      Address = ${data.Interface.Address}
      DNS = ${data.Interface.DNS}
      
      [Peer]
      PublicKey = ${data.Peer.PublicKey}
      AllowedIPs = ${data.Peer.AllowedIPs}
      Endpoint = ${data.Peer.Endpoint}
      PersistentKeepalive = ${data.Peer.PersistentKeepalive}
      ${
        data.Peer.PresharedKey ? 'PresharedKey = ' + data.Peer.PresharedKey : ''
      }
    `
      .replace(/(  +)/g, '')
      .trim()
  }

  let config = configFromJSON(props.config)

  const copy = (data) => navigator.clipboard.writeText(data)
  const saveFile = (data) => {
    let filename = 'peer.conf',
      type = 'conf'

    let file = new Blob([data], { type: type })
    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(file, filename) // IE10+
    } else {
      var a = document.createElement('a'),
        url = URL.createObjectURL(file)
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(function () {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 0)
    }
  }

  return (
    <>
      <Row>
        <Col md={12}>
          <pre style={{ fontSize: '11px' }}>{config}</pre>

          <Row>
            <Col md={6}>
              <Button
                className="btn-block"
                color="primary"
                size="md"
                onClick={(e) => copy(config)}
                outline={true}
              >
                <i className="fa fa-clone" />
                Copy
              </Button>
            </Col>
            <Col md={6}>
              <Button
                className="btn-block"
                color="primary"
                size="md"
                onClick={(e) => saveFile(config)}
                outline={true}
              >
                <i className="fa fa-file" />
                Download
              </Button>
            </Col>
          </Row>
          <div className="text-center">
            <QRCode value={config} />
          </div>
        </Col>
      </Row>
    </>
  )
}

WireguardConfig.propTypes = {
  config: PropTypes.object
}

export default WireguardConfig
