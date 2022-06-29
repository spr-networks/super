import React from 'react'
import PropTypes from 'prop-types'
import InputSelect from 'components/InputSelect'

import WireguardConfig from './WireguardConfig'
import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import { deviceAPI, wireguardAPI } from 'api'
import { wifiAPI } from 'api'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Input,
  Link,
  Stack,
  HStack,
  Spinner,
  Text,
  VStack
} from 'native-base'

export default class WireguardAddPeer extends React.Component {
  state = {
    AllowedIPs: '',
    PrivateKey: '',
    PublicKey: '',
    Endpoint: '',
    addrs: [],
    config: null,
    groups: ['dns', 'wan'],
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
                .updateGroups(peer.PublicKey, this.state.groups)
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

    const allGroups = ['wan', 'dns', 'lan']

    let newPeer = this.state.AllowedIPs == ''

    return (
      <VStack space={4}>
        <FormControl>
          <FormControl.Label>Client</FormControl.Label>

          <ClientSelect
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
          <FormControl.HelperText>Leave empty to assign</FormControl.HelperText>
        </FormControl>
        <FormControl>
          <FormControl.Label>PublicKey</FormControl.Label>

          <Input
            variant="underlined"
            placeholder="base64 pubkey"
            value={this.state.PublicKey}
            onChangeText={(value) => this.handleChange('PublicKey', value)}
            autoFocus
          />
          {/*
            InputRightElement={
              <Button
                rounded="none"
                h="full"
                onPress={this.handleClickGenerate}
              >
                Generate
              </Button>
            }
*/}

          <FormControl.HelperText>
            Leave empty to generate, else run wg pubkey &lt; peer.key
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Endpoint</FormControl.Label>

          <InputSelect
            options={endpoints}
            value={this.state.endpoint}
            onChange={this.handleChangeEndpoint}
          />
          <FormControl.HelperText>
            Leave empty for default
          </FormControl.HelperText>
        </FormControl>

        {newPeer ? (
          <VStack>
            <FormControl flex="1">
              <FormControl.Label>Device Name</FormControl.Label>
              <Input
                size="md"
                variant="underlined"
                value={this.state.deviceName}
                onChangeText={(value) => this.handleChange('deviceName', value)}
              />

              <FormControl.HelperText>
                Assign device name
              </FormControl.HelperText>
            </FormControl>

            <FormControl flex={1}>
              <FormControl.Label>Groups</FormControl.Label>
              <Checkbox.Group
                defaultValue={this.state.groups}
                accessibilityLabel="Set Device Groups"
                onChange={(values) => this.handleChange('groups', values)}
                py="1"
              >
                <HStack w="100%" justifyContent="space-between">
                  {allGroups.map((group) => (
                    <Box key={group} flex={1}>
                      <Checkbox value={group} colorScheme="primary">
                        {group}
                      </Checkbox>
                    </Box>
                  ))}
                </HStack>
              </Checkbox.Group>

              <FormControl.HelperText>
                Assign device to groups for network access
              </FormControl.HelperText>
            </FormControl>
          </VStack>
        ) : null}

        <Button colorScheme="primary" onPress={this.handleSubmit}>
          Save
        </Button>
      </VStack>
    )
  }
}

WireguardAddPeer.propTypes = {
  notifyChange: PropTypes.func
}

WireguardAddPeer.contextType = AlertContext
