import React from 'react'

import { Center, View, useColorModeValue } from 'native-base'

// wizard steps
import AddDevice from './Edit/AddDevice'
import ConnectDevice from './Edit/WifiConnect'

function Wizard() {
  return (
    <View>
      <Center width={['100%', '100%', '4/6']}>
        <AddDevice />
      </Center>
    </View>
  )
}

export default Wizard
