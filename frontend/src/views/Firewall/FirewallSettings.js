import React from 'react'
import { Text, View, VStack } from 'native-base'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

import ICMP from 'components/Firewall/ICMP'
import MDNSAdvertise from 'components/Firewall/MDNSAdvertise'

const FWSettings = (props) => {

  let fetchConfig = () => {
    firewallAPI.config().then((config) => {
      config.MulticastPorts = [];
      this.setState({ config })
    })
  }

  return (
    <VStack>
      <ICMP />
      <MDNSAdvertise />
      <UpstreamServicesList notifyChange={fetchConfig} />
    </VStack>
  )
}

export default FWSettings
