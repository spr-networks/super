import React, { useContext, Component } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import SiteVPN from 'components/Wireguard/SiteVPN'
import { AppContext } from 'AppContext'

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
    const fetchStatus = async () => {
      await this.getStatus()
    }

    fetchStatus()
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
        <HStack alignItems="center" p={4}>
          <Heading fontSize="md">Wireguard</Heading>

          <Switch
            marginLeft="auto"
            defaultIsChecked={this.state.isUp}
            onValueChange={this.handleChange}
          />
        </HStack>
        <Box
          _light={{ bg: 'backgroundCardLight' }}
          _dark={{ bg: 'backgroundCardDark' }}
          p={4}
          mb={4}
          mx={4}
        >
          <Box>
            {this.state.config.listenPort ? (
              <Text>
                Wireguard is listening on port {this.state.config.listenPort}{' '}
                with PublicKey:{' '}
                <Text italic>{this.state.config.publicKey}</Text>
              </Text>
            ) : (
              <Text>
                Wireguard is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </Box>
        </Box>

        <PeerList />

        {!this.context.isPlusDisabled ? (
          //PLUS feature
          <SiteVPN />
        ) : null}
      </View>
    )
  }
}

Wireguard.contextType = AppContext
