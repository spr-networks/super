import React from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'layouts/Admin'
import { wireguardAPI, pfwAPI } from 'api'

import {
  Button,
  ButtonText,
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
      <VStack space="md">
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Remote Endpoint</FormControlLabelText>
          </FormControlLabel>

          <Input size="md" variant="underlined">
            <InputField
              value={this.state.Endpoint}
              onChangeText={(value) => this.handleChange('Endpoint', value)}
            />
          </Input>

          <FormControlHelper>
            <FormControlHelperText>
              The remote wireguard VPN address and port, "1.2.3.4:51820"
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Remote Peer's PublicKey</FormControlLabelText>
          </FormControlLabel>

          <Input variant="underlined">
            <InputField
              placeholder="base64 pubkey"
              value={this.state.PeerPublicKey}
              onChangeText={(value) =>
                this.handleChange('PeerPublicKey', value)
              }
            />
          </Input>

          <FormControlHelper>
            <FormControlHelperText>
              The Public Key for the Remote Endpoint
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Interface Address</FormControlLabelText>
          </FormControlLabel>

          <Input variant="underlined">
            <InputField
              size="md"
              placeholder="10.10.10.1"
              value={this.state.Address}
              onChangeText={(value) => this.handleChange('Address', value)}
            />
          </Input>

          <FormControlHelper>
            <FormControlHelperText>
              The local interface address
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>PresharedKey</FormControlLabelText>
          </FormControlLabel>

          <Input variant="underlined">
            <InputField
              placeholder="base64 pubkey"
              value={this.state.PresharedKey}
              onChangeText={(value) => this.handleChange('PresharedKey', value)}
            />
          </Input>

          <FormControlHelper>
            <FormControlHelperText>
              Leave empty if no PresharedKey is configured
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>PrivateKey</FormControlLabelText>
          </FormControlLabel>

          <HStack>
            <Input size="sm" variant="underlined" flex={1}>
              <InputField
                placeholder="base64 pubkey"
                value={this.state.PrivateKey}
                onChangeText={(value) => this.handleChange('PrivateKey', value)}
              />
            </Input>

            <Button
              size="sm"
              rounded="$none"
              variant="solid"
              action="secondary"
              onPress={this.handleClickGenerate}
            >
              <ButtonText>Generate</ButtonText>
            </Button>
          </HStack>
          <FormControlHelper>
            <FormControlHelperText>
              Local Site's Private Key
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        {this.state.PublicKey ? (
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Public Key</FormControlLabelText>
            </FormControlLabel>
            <FormControlHelper>
              <FormControlHelperText size="xs">
                {this.state.PublicKey}
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        ) : null}

        <Button action="primary" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

WireguardAddSite.propTypes = {
  notifyChange: PropTypes.func
}

WireguardAddSite.contextType = AlertContext
