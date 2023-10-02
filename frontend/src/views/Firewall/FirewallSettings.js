import React from 'react'
import { Text, View, VStack } from 'native-base'

import ICMP from 'components/Firewall/ICMP'
import Multicast from 'components/Firewall/Multicast'

const FWSettings = (props) => {
  return (
    <VStack>
      <ICMP />
      <Multicast />
    </VStack>
  )
}

export default FWSettings
