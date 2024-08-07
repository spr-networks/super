import React from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'

import OTPValidate from 'components/Auth/OTPValidate'

import { Box, Button, ButtonText, Heading, VStack } from '@gluestack-ui/themed'

const AuthValidate = (props) => {
  const navigate = useNavigate()

  const onSuccess = async () => {
    let url = '/admin/home'
    try {
      url = await getAuthReturn()
    } catch {
      url = '/admin/home'
    }

    navigate(url)
  }

  return (
    <Box
      px="$4"
      py="$8"
      sx={{
        '@base': { w: '$full', mt: '$1/4' },
        '@md': { w: '$1/4', mt: '8vh', alignSelf: 'center', rounded: 10 },
        _dark: {
          bg: '$blueGray900'
        }
      }}
      bg="$white"
    >
      <VStack space="md">
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

        <OTPValidate onSuccess={onSuccess} />

        <Button
          action="secondary"
          variant="outline"
          onPress={() => navigate(Platform.OS == 'web' ? -2 : -2)}
        >
          <ButtonText>Back</ButtonText>
        </Button>
      </VStack>
    </Box>
  )
}

export default AuthValidate
