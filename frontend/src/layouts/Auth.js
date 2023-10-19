import React from 'react'
import { Outlet } from 'react-router-dom'
import { Box } from '@gluestack-ui/themed'

const AuthLayout = () => {
  return (
    <Box
      bg="$warmGray200"
      w="$full"
      h="$full"
      _sx={{
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
