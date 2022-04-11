import React from 'react'
import PropTypes from 'prop-types'
import QRCode from 'react-qr-code'

import { APIErrorContext } from 'layouts/Admin'

import { wireguardAPI } from 'api/Wireguard'

import {
  Button,
  Col,
  Label,
  Form,
  FormGroup,
  FormText,
  Input,
  Row
} from 'reactstrap'

export default class WireguardAddPeer extends React.Component {
  static contextType = APIErrorContext
  state = { AllowedIPs: '', PublicKey: '', config: null }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    //TODO verify IP && pubkey
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleSubmit(event) {
    event.preventDefault()
    let peer = {
      AllowedIPs: this.state.AllowedIPs,
      PublicKey: this.state.PublicKey
    }

    wireguardAPI
      .putPeer(peer)
      .then((config) => {
        if (this.props.notifyChange) {
          this.props.notifyChange('peers')
        }

        this.setState({ config })
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  render() {
    if (this.state.config) {
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
        `.replace(/(  +)/g, '')
      }

      let config = configFromJSON(this.state.config)

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
              {/*this.state.PublicKey ? () : null*/}
              <div className="text-center">
                <QRCode value={config} />
              </div>
            </Col>
          </Row>
        </>
      )
    }

    return (
      <Form onSubmit={this.handleSubmit}>
        <Row>
          <Label for="AllowedIPs" md={2}>
            AllowedIPs
          </Label>
          <Col md={10}>
            <FormGroup>
              <Input
                type="text"
                id="AllowedIPs"
                placeholder="192.168.3.2/32"
                name="AllowedIPs"
                value={this.state.AllowedIPs}
                onChange={this.handleChange}
                autoFocus
              />
              <FormText tag="span">Leave empty to assign</FormText>
            </FormGroup>
          </Col>
        </Row>
        <Row>
          <Label for="PublicKey" sm={2}>
            PublicKey
          </Label>
          <Col sm={10}>
            <FormGroup>
              <Input
                type="text"
                id="PublicKey"
                placeholder="base64 pubkey"
                name="PublicKey"
                value={this.state.PublicKey}
                onChange={this.handleChange}
                autoFocus
              />
              <FormText tag="span">
                Leave empty to generate, else run wg pubkey &lt; peer.key
              </FormText>
            </FormGroup>
          </Col>
        </Row>

        <Row>
          <Col sm={{ offset: 2, size: 10 }}>
            <Button
              className="btn-round"
              color="primary"
              size="md"
              type="submit"
              onClick={this.handleSubmit}
            >
              Save
            </Button>
          </Col>
        </Row>
      </Form>
    )
  }
}

WireguardAddPeer.propTypes = {
  notifyChange: PropTypes.func
}
