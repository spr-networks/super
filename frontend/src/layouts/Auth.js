import React from 'react'
import { Outlet } from 'react-router-dom'
import { View } from '@gluestack-ui/themed'

const AuthLayout = () => {
  return (
    <View
      bg="$warmGray100"
      w="$full"
      h="$full"
      sx={{
        _dark: { bg: '$blueGray900' }
      }}
      alignItems="center"
      justifyContent={{ base: 'flex-start', md: 'center' }}
    >
      <Outlet />
    </View>
  )
}

export default AuthLayout
