import React from 'react'
import { Text, View, VStack } from 'native-base'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

import ICMP from 'components/Firewall/ICMP'
import MDNSAdvertise from 'components/Firewall/MDNSAdvertise'

const FWSettings = (props) => {

  return (
    <VStack>
      <ICMP />
      <MDNSAdvertise />
      <UpstreamServicesList />
    </VStack>
  )
}

export default FWSettings
