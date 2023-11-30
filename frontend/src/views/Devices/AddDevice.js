import React from 'react'
import { useNavigate } from 'react-router-dom'

import { ScrollView } from '@gluestack-ui/themed'

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
    <ScrollView
      bg="$backgroundCardLight"
      h="$full"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      {...swipeHandlers}
    >
      <AddDevice />
    </ScrollView>
  )
}

export default AddDeviceView
