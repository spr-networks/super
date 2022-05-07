import React from 'react'

import { Box, View, useColorModeValue } from 'native-base'

// wizard steps
import AddDevice from './Edit/AddDevice'
import ConnectDevice from './Edit/WifiConnect'

function Wizard() {
  return (
    <View>
      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="md"
        width={['100%', '100%', '4/6']}
        p="4"
      >
        <AddDevice />
      </Box>
    </View>
  )
}

export default Wizard
