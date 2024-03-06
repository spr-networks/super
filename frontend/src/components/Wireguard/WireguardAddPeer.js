import React from 'react'
import PropTypes from 'prop-types'
import InputSelect from 'components/InputSelect'

import WireguardConfig from './WireguardConfig'
import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import { deviceAPI, wireguardAPI } from 'api'
import { api, wifiAPI } from 'api'

import { Address4 } from 'ip-address'

import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxGroup,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  HStack,
  VStack
} from '@gluestack-ui/themed'

export default class WireguardAddPeer extends React.Component {
  state = {
    AllowedIPs: '',
    PrivateKey: '',
    PublicKey: '',
    Endpoint: ``,
    addrs: [],
    config: null,
    policies: ['dns', 'wan'],
    deviceName: ''
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleChangeClient = this.handleChangeClient.bind(this)
    this.handleChangeEndpoint = this.handleChangeEndpoint.bind(this)
    this.handleClickGenerate = this.handleClickGenerate.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    //TODO verify IP && pubkey
    this.setState({ [name]: value })
  }

  handleChangeClient(newValue) {
    let ClientIP = newValue
    // TODO match device by ip
    this.setState({ AllowedIPs: ClientIP })
  }

  handleChangeEndpoint(newValue) {
    this.setState({ Endpoint: newValue })
  }

  handleSubmit() {
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
          this.context.error('API Failure: ' + error.message)
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
              deviceAPI
                .updatePolicies(peer.PublicKey, this.state.policies)
                .catch((error) =>
                  this.context.error(
                    '[API] updateDevice error: ' + error.message
                  )
                )

              if (this.state.deviceName != '') {
                deviceAPI
                  .updateName(peer.PublicKey, this.state.deviceName)
                  .catch((error) =>
                    this.context.error(
                      '[API] updateDevice error: ' + error.message
                    )
                  )
              }

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
            .catch((err) => this.context.error(err))
        })
        .catch((err) => this.context.error('wireguardAPI.genKey Error: ' + err))
    } else {
      linkPubKeyToDevice(peer)
        .then((res) => addPeer(peer))
        .catch((err) => this.context.error(err))
    }
  }

  handleClickGenerate() {
    wireguardAPI
      .genKey()
      .then((keyPair) => {
        this.setState(keyPair)
      })
      .catch((err) => this.context.error('wireguardAPI.genKey Error: ' + err))
  }

  componentDidMount() {
    if (this.props.defaultEndpoints?.length) {
      let Endpoint = `${this.props.defaultEndpoints[0]}:${
        this.props.config.listenPort || 51280
      }`

      this.setState({ Endpoint })
    }

    wifiAPI.ipAddr().then((data) => {
      api.get('/subnetConfig').then((config) => {
        let addrs = this.props.defaultEndpoints.map((e) => {
          return { local: e }
        })

        for (let entry of data) {
          next: for (let address of entry.addr_info) {
            if (address.scope == 'global') {
              //filter out any tiny net ips
              let local_addr = new Address4(address.local)
              for (let net of config.TinyNets) {
                let subnet = new Address4(net)
                if (local_addr.isInSubnet(subnet)) {
                  continue next
                }
              }

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

    const allPolicies = ['wan', 'dns', 'lan', 'lan_upstream', 'disabled']

    let newPeer = this.state.AllowedIPs == ''

    return (
      <VStack space="md">
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Client</FormControlLabelText>
          </FormControlLabel>

          <ClientSelect
            value={this.state.AllowedIPs}
            onChange={this.handleChangeClient}
          />
          <FormControlHelper>
            <FormControlHelperText>Leave empty to assign</FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>PublicKey</FormControlLabelText>
          </FormControlLabel>

          <Input variant="underlined">
            <InputField
              placeholder="base64 pubkey"
              value={this.state.PublicKey}
              onChangeText={(value) => this.handleChange('PublicKey', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              Leave empty to generate, else run wg pubkey &lt; peer.key
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Endpoint</FormControlLabelText>
          </FormControlLabel>

          <InputSelect
            options={endpoints}
            value={this.state.Endpoint}
            onChange={this.handleChangeEndpoint}
            onChangeText={this.handleChangeEndpoint}
          />
          <FormControlHelper>
            <FormControlHelperText>
              Leave empty for default
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        {newPeer ? (
          <>
            <FormControl>
              <FormControlLabel>
                <FormControlLabelText>Device Name</FormControlLabelText>
              </FormControlLabel>
              <Input size="md" variant="underlined">
                <InputField
                  value={this.state.deviceName}
                  onChangeText={(value) =>
                    this.handleChange('deviceName', value)
                  }
                />
              </Input>

              <FormControlHelper>
                <FormControlHelperText>
                  Assign device name
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>

            <FormControl>
              <FormControlLabel>
                <FormControlLabelText>Policies</FormControlLabelText>
              </FormControlLabel>

              <CheckboxGroup
                value={this.state.policies}
                accessibilityLabel="Set Device Policies"
                onChange={(values) => this.handleChange('policies', values)}
                py="$1"
              >
                <HStack space="xl">
                  {allPolicies.map((group) => (
                    <Checkbox key={group} value={group} colorScheme="primary">
                      <CheckboxIndicator mr="$2">
                        <CheckboxIcon />
                      </CheckboxIndicator>
                      <CheckboxLabel>{group}</CheckboxLabel>
                    </Checkbox>
                  ))}
                </HStack>
              </CheckboxGroup>

              <FormControlHelper>
                <FormControlHelperText>
                  Assign device policies for network access
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
          </>
        ) : null}

        <Button action="primary" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

WireguardAddPeer.propTypes = {
  notifyChange: PropTypes.func
}

WireguardAddPeer.contextType = AlertContext
