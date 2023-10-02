import React from 'react'
import { Text, View, VStack } from 'native-base'

import ICMP from 'components/Firewall/ICMP'

const FWSettings = (props) => {
  return (
    <VStack>
      <ICMP />
    </VStack>
  )
}

export default FWSettings
