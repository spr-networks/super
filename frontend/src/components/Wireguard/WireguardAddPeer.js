import React from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'

import WireguardConfig from './WireguardConfig'
import { APIErrorContext } from 'layouts/Admin'

import { wireguardAPI } from 'api/Wireguard'
import { wifiAPI } from 'api'

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
  state = {
    AllowedIPs: '',
    PublicKey: '',
    Endpoint: '',
    addrs: [],
    config: null
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleChangeEndpoint = this.handleChangeEndpoint.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    //TODO verify IP && pubkey
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleChangeEndpoint(newValue, actionMeta) {
    this.setState({ Endpoint: newValue ? newValue.value : '' })
  }

  handleSubmit(event) {
    event.preventDefault()
    let peer = {
      AllowedIPs: this.state.AllowedIPs,
      PublicKey: this.state.PublicKey,
      Endpoint: this.state.Endpoint
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

  componentDidMount() {
    wifiAPI.ipAddr().then((data) => {
      let addrs = []
      for (let entry of data) {
        for (let address of entry.addr_info) {
          if (address.scope == 'global') {
            address.ifname = entry.ifname
            addrs.push(address)
          }

          break
        }
      }
      // config.wg0.listenPort
      //ip:port :51280
      this.setState({ addrs })
    })
  }

  render() {
    if (this.state.config) {
      return <WireguardConfig config={this.state.config} />
    }

    let endpoints = this.state.addrs.map((addr) => {
      let listenPort = this.props.config.listenPort || 1024 //51280
      return {
        label: `${addr.local}:${listenPort}`,
        value: `${addr.local}:${listenPort}`
      }
    })

    let endpoint = this.state.Endpoint
      ? { label: this.state.Endpoint, value: this.state.Endpoint }
      : null

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
          <Label for="Endpoint" sm={2}>
            Endpoint
          </Label>
          <Col sm={10}>
            <FormGroup>
              <Select
                isClearable
                options={endpoints}
                value={endpoint}
                onChange={this.handleChangeEndpoint}
              />
              <FormText tag="span">Leave empty for default</FormText>
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
