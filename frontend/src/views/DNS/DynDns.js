import React, { Component } from 'react'

import { dyndnsAPI } from 'api/Dyndns'
import PeerList from 'components/Wireguard/PeerList'

import {
  Box,
  Heading,
  HStack,
  Input,
  Link,
  Switch,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'


export default class DynDns extends Component {
  state = { isUp: true, config: {} }
  constructor(props) {
    super(props)
    this.config = {}
    this.isUp = true

    this.handleChange = this.handleChange.bind(this)
  }

  getConfig() {

    dyndnsAPI
      .config()
      .then((config) => {
        this.setState({ config })

        /*
        let publicKey = status.wg0.publicKey,
          listenPort = status.wg0.listenPort

        if (!listenPort) {
          this.setState({ isUp: false })
        }

        let config = { publicKey, listenPort }
        this.setState({ config })
        */
      })
      .catch((err) => {
        this.setState({ isUp: false })
      })
  }

  componentDidMount() {
    this.getConfig()
  }

  handleChange() {
    let value = !this.state.isUp
    /*
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
      */
  }

  render() {
    console.log(this.state.config.domains)
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
          <HStack alignItems="center" mb="4">
            <Heading fontSize="xl">Dynamic DNS</Heading>

            <Switch
              marginLeft="auto"
              defaultIsChecked={this.state.isUp}
              onValueChange={this.handleChange}
            />
          </HStack>
          <Box>
            <Link href="https://github.com/TimothyYe/godns#configuration-file-format">
              Powered by godns. Click here to see the Documentation on Github.
            </Link>

            {this.state.config.provider != "" ? (
              <Box
                /*bg={useColorModeValue('warmGray.50', 'blueGray.800')}*/
                rounded="md"
                width="100%"
                p="4"
              >
                <VStack space={2}>
                  {Object.keys(this.state.config).filter(label => label != "domains").map((label) => (
                    <HStack space={4} justifyContent="left">
                      <Text bold w="1/4" textAlign="right">
                        {label}
                      </Text>
                      <Input w="1/4" value={this.state.config[label]} />
                    </HStack>
                  ))}

                  <VStack space={2}>
                    <Text bold w="1/4" textAlign="right">Domains</Text>
                    {this.state.config.domains ? Object.keys(this.state.config.domains).map((i) => (

                      <HStack space={4} justifyContent="left">
                        <Text bold w="1/4" textAlign="right">{this.state.config.domains[i].domain_name}</Text>
                        {JSON.stringify(this.state.config.domains)}
                      </HStack>
                    )) : null }
                  </VStack>
                </VStack>
              </Box>
            ) : (
              <Text>
                DynDNS Plugin is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </Box>
        </Box>

      </View>
    )
  }
}
