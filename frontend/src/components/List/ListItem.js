import React from 'react'

import { Box, HStack } from '@gluestack-ui/themed'

const ListItem = ({ p, children, ...props }) => {
  return (
    <HStack
      bg="$backgroundCardLight"
      borderColor="$borderColorCardLight"
      borderBottomWidth={1}
      sx={{
        _dark: {
          bg: '$backgroundCardDark',
          borderColor: '$borderColorCardDark'
        }
      }}
      p={p || '$4'}
      space="sm"
      justifyContent="space-between"
      alignItems="center"
      {...props}
    >
      {children}
    </HStack>
  )
}

export default ListItem
