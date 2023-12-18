import React, { Component } from 'react'
import OTPValidate from 'components/Auth/OTPValidate'

import {
  Box,
  Heading,
  View,
  VStack,
  useColorMode,
} from '@gluestack-ui/themed'


const AuthValidate = (props) => {

  const colorMode = useColorMode()

  return (
    <Box
      px="$4"
      py="$8"
      sx={{
        '@base': { w: '$full', mt: '$1/4' },
        '@md': { w: '$1/4', mt: '$0', alignSelf: 'center', rounded: 10 }
      }}
      bg={colorMode === 'light' ? 'white' : '$blueGray900'}
    >
      <VStack space="lg">
        <Heading
          alignSelf="center"
          size="lg"
          fontWeight="300"
          color="$coolGray800"
          sx={{
            _dark: {
              color: '$warmGray50'
            }
          }}
        >
          Validate OTP Code
        </Heading>
        <OTPValidate/>
      </VStack>
    </Box>
  )
}


export default AuthValidate
