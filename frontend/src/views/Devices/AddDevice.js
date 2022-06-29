import React from 'react'

import { Box, View, useColorModeValue } from 'native-base'

import AddDevice from 'components/Devices/AddDevice'

const AddDeviceView = () => {
  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width={['100%', '100%', '4/6']}
      p="4"
    >
      <AddDevice />
    </Box>
  )
}

export default AddDeviceView
