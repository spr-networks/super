import React from 'react'
import PropTypes from 'prop-types'
import InputSelect from 'components/InputSelect'

import WireguardConfig from './WireguardConfig'
import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import { wireguardAPI, pfwAPI } from 'api'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Input,
  InputRightElement,
  Link,
  Stack,
  HStack,
  Spinner,
  Text,
  VStack
} from 'native-base'

export default class WireguardAddSite extends React.Component {
  state = {
    Address: '',
    PeerPublicKey: '',
    PrivateKey: '',
    PresharedKey: '',
    Endpoint: '',
    PublicKey: ''
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleClickGenerate = this.handleClickGenerate.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    //TODO verify IP && pubkey
    this.setState({ [name]: value })
  }

  handleSubmit() {
    pfwAPI
      .addSiteVPN({
        Address: this.state.Address,
        PeerPublicKey: this.state.PeerPublicKey,
        PrivateKey: this.state.PrivateKey,
        PresharedKey: this.state.PresharedKey,
        Endpoint: this.state.Endpoint
      })
      .then((ret) => {
        if (this.props.notifyChange) {
          this.props.notifyChange('sites')
        }
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  handleClickGenerate() {
    wireguardAPI
      .genKey()
      .then((keyPair) => {
        this.setState(keyPair)
      })
      .catch((err) => this.context.error('wireguardAPI.genKey Error: ' + err))
  }

  componentDidMount() {}

  render() {
    return (
      <VStack space={4}>
        <FormControl>
          <FormControl.Label>Remote Endpoint</FormControl.Label>

          <Input
            size="md"
            variant="underlined"
            value={this.state.Endpoint}
            onChangeText={(value) => this.handleChange('Endpoint', value)}
          />

          <FormControl.HelperText>
            The remote wireguard VPN address and port, "1.2.3.4:51820"
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Remote Peer's PublicKey</FormControl.Label>

          <Input
            variant="underlined"
            placeholder="base64 pubkey"
            value={this.state.PeerPublicKey}
            onChangeText={(value) => this.handleChange('PeerPublicKey', value)}
            autoFocus
          />

          <FormControl.HelperText>
            The Public Key for the Remote Endpoint
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Interface Address</FormControl.Label>

          <Input
            size="md"
            variant="underlined"
            value={this.state.Address}
            onChangeText={(value) => this.handleChange('Address', value)}
          />

          <FormControl.HelperText>
            The local interface address
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>PresharedKey</FormControl.Label>

          <Input
            variant="underlined"
            placeholder="base64 pubkey"
            value={this.state.PresharedKey}
            onChangeText={(value) => this.handleChange('PresharedKey', value)}
            autoFocus
          />

          <FormControl.HelperText>
            Leave empty if no PresharedKey is configured
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>PrivateKey</FormControl.Label>

          <HStack>
            <Input
              variant="underlined"
              placeholder="base64 pubkey"
              value={this.state.PrivateKey}
              onChangeText={(value) => this.handleChange('PrivateKey', value)}
              autoFocus
              flex={1}
            />

            <Button
              rounded="none"
              h="full"
              variant="solid"
              colorScheme="muted"
              onPress={this.handleClickGenerate}
            >
              Generate
            </Button>
          </HStack>
          <FormControl.HelperText>
            Local Site's Private Key
          </FormControl.HelperText>

          <FormControl.Label>Public Key:</FormControl.Label>
          <FormControl.HelperText>
            {' '}
            {this.state.PublicKey}{' '}
          </FormControl.HelperText>
        </FormControl>

        <Button colorScheme="primary" onPress={this.handleSubmit}>
          Save
        </Button>
      </VStack>
    )
  }
}

WireguardAddSite.propTypes = {
  notifyChange: PropTypes.func
}

WireguardAddSite.contextType = AlertContext
