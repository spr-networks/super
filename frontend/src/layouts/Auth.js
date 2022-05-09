import React from 'react'
import { Outlet } from 'react-router-dom'

import Footer from 'components/Footer/Footer'

import { View, Box, useColorModeValue } from 'native-base'

const AuthLayout = () => {
  return (
    <>
      <Box
        w="100%"
        h={{ base: '100%', md: '100vh' }}
        _light={{ bg: 'coolGray.100' }}
        _dark={{ bg: 'blueGray.900' }}
        p={20}
        alignItems="center"
        nativeID={useColorModeValue(
          'nativebase-body-light',
          'nativebase-body-dark'
        )}
      >
        <Box>
          <Outlet />
          <Footer direction="row" />
        </Box>
      </Box>
    </>
  )
}

export default AuthLayout
