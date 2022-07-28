import React from 'react'
import { Outlet } from 'react-router-dom'
import { StyleSheet } from 'react-native'

import Footer from 'components/Footer/Footer'

import { View, Box, Image, useColorModeValue } from 'native-base'

//const imgBackground = require('../assets/img/bg/bg.jpg')

const AuthLayout = () => {
  return (
    <Box
      w="100%"
      h="100%"
      _light={{ bg: 'warmGray.200' }}
      _dark={{ bg: 'blueGray.900' }}
      alignItems="center"
      justifyContent="center"
      nativeID={useColorModeValue(
        'nativebase-body-light',
        'nativebase-body-dark'
      )}
    >
      <Outlet />
      {/*<Footer
        color="light.200"
        position="fixed"
        bottom={2}
        right={2}
        justifyContent="center"
      />*/}
      {/*<View w="100vw" h="100vh" bg="black">
        <Image
          source="/bg.jpg"
          alt="spr background"
          opacity={0.4}
          __height="100vh"
          resizeMode="cover"
        />
        <View marginTop="-90vh">
          <Outlet />
          <Footer
            color="light.200"
            position="fixed"
            bottom={2}
            right={2}
            justifyContent="center"
          />
        </View>
      </View>*/}
    </Box>
  )
}

export default AuthLayout
