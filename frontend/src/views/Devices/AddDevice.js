import React from 'react'
import { useNavigate } from 'react-router-dom'

import { View } from '@gluestack-ui/themed'

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
    <View
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      p="$4"
      h={'100%'}
      {...swipeHandlers}
    >
      <AddDevice />
    </View>
  )
}

export default AddDeviceView
