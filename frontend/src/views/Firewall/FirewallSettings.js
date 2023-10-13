import React from 'react'
import { ScrollView, VStack } from '@gluestack-ui/themed'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

import ICMP from 'components/Firewall/ICMP'
import MDNSAdvertise from 'components/Firewall/MDNSAdvertise'

const FWSettings = (props) => {
  return (
    <ScrollView __sx={{ '@md': { width: '$3/4' } }}>
      <VStack space="lg">
        <ICMP />
        <UpstreamServicesList />
        <MDNSAdvertise />
      </VStack>
    </ScrollView>
  )
}

export default FWSettings
