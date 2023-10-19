import React from 'react'
import { Outlet } from 'react-router-dom'
import Footer from 'components/Footer/Footer'
import { Box, Image, View, useColorMode } from '@gluestack-ui/themed'

const AuthLayout = () => {
  const colorMode = useColorMode()

  return (
    <Box
      w="100%"
      h={{ base: '100vh', md: '100vh' }}
      sx={{
        _light: { bg: '$warmGray200' },
        _dark: { bg: '$blueGray900' }
      }}
      alignItems="center"
      justifyContent="center"
    >
      <View w="100vw" h="100vh" bg="$black">
        <Image
          source="/bg.jpg"
          opacity={0.4}
          h="100vh"
          w="100vw"
          resizeMode="cover"
        />
        <View marginTop="-90vh">
          <Outlet />
          <Footer
            color="$light200"
            position="fixed"
            bottom={2}
            right={2}
            justifyContent="center"
          />
        </View>
      </View>
    </Box>
  )
}

export default AuthLayout
