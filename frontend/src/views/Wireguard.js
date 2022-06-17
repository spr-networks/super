import React, { Component } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'

import {
  Box,
  Heading,
  HStack,
  Switch,
  Text,
  View,
  useColorModeValue
} from 'native-base'

export default class Wireguard extends Component {
  state = { isUp: true, config: {} }
  constructor(props) {
    super(props)
    this.config = {}
    this.isUp = true

    this.handleChange = this.handleChange.bind(this)
  }

  getStatus() {
    wireguardAPI
      .status()
      .then((status) => {
        let publicKey = status.wg0.publicKey,
          listenPort = status.wg0.listenPort

        if (!listenPort) {
          this.setState({ isUp: false })
        }

        let config = { publicKey, listenPort }
        this.setState({ config })
      })
      .catch((err) => {
        this.setState({ isUp: false })
      })
  }

  componentDidMount() {
    this.getStatus()
  }

  handleChange() {
    let value = !this.state.isUp
    let fn = value ? wireguardAPI.up : wireguardAPI.down
    fn()
      .then((res) => {
        this.setState({ isUp: value })
        if (value) {
          this.getStatus()
        } else {
          this.setState({ config: {} })
        }
      })
      .catch((err) => {})
  }

  render() {
    return (
      <View>
        <Box
          rounded="md"
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p="4"
          mb="4"
        >
          <HStack alignItems="center" mb={4}>
            <Heading fontSize="md">Wireguard</Heading>

            <Switch
              marginLeft="auto"
              defaultIsChecked={this.state.isUp}
              onValueChange={this.handleChange}
            />
          </HStack>
          <Box>
            {this.state.config.listenPort ? (
              <Text>
                Wireguard is listening on port {this.state.config.listenPort}{' '}
                with PublicKey: <em>{this.state.config.publicKey}</em>
              </Text>
            ) : (
              <Text>
                Wireguard is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </Box>
        </Box>

        <PeerList />
      </View>
    )
  }
}
