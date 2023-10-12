import React from 'react'
import { Outlet } from 'react-router-dom'
import { Box } from '@gluestack-ui/themed'

const AuthLayout = () => {
  return (
    <Box
      w="full"
      h="full"
      _sx={{
        _light: { bg: '$warmGray200' },
        _dark: { bg: '$blueGray900' }
      }}
      alignItems="center"
      justifyContent={{ base: 'flex-start', md: 'center' }}
    >
      <Outlet />
    </Box>
  )
}

export default AuthLayout
