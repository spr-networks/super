import React from 'react'
import { useNavigate } from 'react-router-dom'

import { Box, View, useColorModeValue } from 'native-base'

import useSwipe from 'components/useSwipe'
import AddDevice from 'components/Devices/AddDevice'

const AddDeviceView = () => {
  const navigate = useNavigate()

  const swipeHandlers = useSwipe({
    onSwipedRight: () => {
      navigate('/admin/devices')
    }
  })

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      p={4}
      h={'100%'}
      {...swipeHandlers}
    >
      <AddDevice />
    </Box>
  )
}

export default AddDeviceView
