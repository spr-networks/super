import React from 'react'
import { SafeAreaView } from 'react-native'
import { Outlet } from 'react-router-dom'
import { View, useColorMode } from '@gluestack-ui/themed'

const AuthLayout = () => {
  let colorMode = useColorMode()

  const backgroundColor =
    colorMode === 'light' ? '$warmGray100' : '$blueGray900'

  return (
    <View
      bg="$warmGray100"
      w="$full"
      h="$full"
      sx={{
        _dark: { bg: '$blueGray900' },
        '@md': {
          alignItems: 'center',
          justifyContent: 'center'
        }
      }}
    >
      <SafeAreaView
        style={{
          backgroundColor
        }}
      />

      <Outlet />
    </View>
  )
}

export default AuthLayout
