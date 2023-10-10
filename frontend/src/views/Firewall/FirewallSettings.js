import React from 'react'
import { ScrollView, Text, View, VStack } from 'native-base'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

import ICMP from 'components/Firewall/ICMP'
import MDNSAdvertise from 'components/Firewall/MDNSAdvertise'

const FWSettings = (props) => {
  return (
    <ScrollView>
      <VStack space={4} width={{ base: '100%', md: '75%' }}>
        <ICMP />
        <UpstreamServicesList />
        <MDNSAdvertise />
      </VStack>
    </ScrollView>
  )
}

export default FWSettings
