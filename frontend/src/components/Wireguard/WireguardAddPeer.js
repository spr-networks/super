import React from 'react'
import PropTypes from 'prop-types'
import CreatableSelect from 'react-select/creatable'

import WireguardConfig from './WireguardConfig'
import { APIErrorContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import { deviceAPI, wireguardAPI } from 'api'
import { wifiAPI } from 'api'

import {
  Button,
  Col,
  Label,
  Form,
  FormGroup,
  FormText,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  Row,
  UncontrolledTooltip
} from 'reactstrap'

export default class WireguardAddPeer extends React.Component {
  static contextType = APIErrorContext
  state = {
    AllowedIPs: '',
    PrivateKey: '',
    PublicKey: '',
    Endpoint: '',
    addrs: [],
    config: null
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleChangeClient = this.handleChangeClient.bind(this)
    this.handleChangeEndpoint = this.handleChangeEndpoint.bind(this)
    this.handleClickGenerate = this.handleClickGenerate.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    //TODO verify IP && pubkey
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleChangeClient(newValue) {
    let ClientIP = newValue ? newValue.value : ''
    // TODO match device by ip
    this.setState({ AllowedIPs: ClientIP })
  }

  handleChangeEndpoint(newValue, actionMeta) {
    this.setState({ Endpoint: newValue ? newValue.value : '' })
  }

  handleSubmit(event) {
    event.preventDefault()

    const addPeer = (peer) => {
      return wireguardAPI
        .putPeer(peer)
        .then((config) => {
          if (this.props.notifyChange) {
            this.props.notifyChange('peers')
          }

          if (this.state.PrivateKey) {
            config.Interface.PrivateKey = this.state.PrivateKey
          }

          this.setState({ config })
        })
        .catch((error) => {
          this.context.reportError('API Failure: ' + error.message)
        })
    }

    // update device wgpubkey by matching ip
    const linkPubKeyToDevice = (peer) => {
      return new Promise((resolve, reject) => {
        deviceAPI
          .list()
          .then((devices) => {
            let device = Object.values(devices)
              .filter(
                (d) =>
                  this.state.AllowedIPs != '' &&
                  d.RecentIP == this.state.AllowedIPs &&
                  d.MAC
              )
              .pop()

            // update device WGPubKey
            if (device) {
              deviceAPI
                .update(device.MAC, { WGPubKey: peer.PublicKey })
                .then((res) => {
                  resolve(peer)
                })
                .catch((err) => reject('deviceAPI.update Error: ' + err))
            } else {
              // will create a new device for the peer
              resolve(peer)
            }
          })
          .catch((err) => reject('deviceAPI.list Error: ' + err))
      })
    }

    let peer = {
      AllowedIPs: this.state.AllowedIPs,
      PublicKey: this.state.PublicKey,
      Endpoint: this.state.Endpoint
    }

    if (peer.AllowedIPs.length && !peer.AllowedIPs.includes('/')) {
      peer.AllowedIPs = `${peer.AllowedIPs}/32`
    }

    if (!peer.PublicKey) {
      wireguardAPI
        .genKey()
        .then((keyPair) => {
          this.setState({ PrivateKey: keyPair.PrivateKey })

          peer.PublicKey = keyPair.PublicKey
          linkPubKeyToDevice(peer)
            .then((res) => addPeer(peer))
            .catch((err) => this.context.reportError(err))
        })
        .catch((err) =>
          this.context.reportError('wireguardAPI.genKey Error: ' + err)
        )
    } else {
      linkPubKeyToDevice(peer)
        .then((res) => addPeer(peer))
        .catch((err) => this.context.reportError(err))
    }
  }

  handleClickGenerate(e) {
    wireguardAPI
      .genKey()
      .then((keyPair) => {
        this.setState(keyPair)
      })
      .catch((err) =>
        this.context.reportError('wireguardAPI.genKey Error: ' + err)
      )
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
            Client
          </Label>
          <Col md={10}>
            <FormGroup>
              <ClientSelect
                isCreatable
                skipAll
                value={this.state.AllowedIPs}
                onChange={this.handleChangeClient}
              />
              {/*<Input
                type="text"
                id="AllowedIPs"
                placeholder="192.168.3.2/32"
                name="AllowedIPs"
                value={this.state.AllowedIPs}
                onChange={this.handleChange}
                autoFocus
              />*/}
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
              <InputGroup size="md" style={{ zIndex: 0 }}>
                <Input
                  type="text"
                  id="PublicKey"
                  placeholder="base64 pubkey"
                  name="PublicKey"
                  value={this.state.PublicKey}
                  onChange={this.handleChange}
                  autoFocus
                />
                <InputGroupAddon addonType="append">
                  <Button
                    className="m-0 p-2 pl-3 pr-3"
                    color="primary"
                    id="tooltipGenerate"
                    onClick={this.handleClickGenerate}
                  >
                    <i className="fa fa-refresh" />
                  </Button>
                  <UncontrolledTooltip delay={0} target="tooltipGenerate">
                    Generate keypair
                  </UncontrolledTooltip>
                </InputGroupAddon>
              </InputGroup>

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
              <CreatableSelect
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
