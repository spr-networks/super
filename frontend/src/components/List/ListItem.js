import React from 'react'

import { Box, HStack } from '@gluestack-ui/themed'

const ListItem = (props) => {
  return (
    <Box
      bg="$backgroundCardLight"
      borderColor="$borderColorCardLight"
      borderBottomWidth={1}
      sx={{
        _dark: {
          bg: '$backgroundCardDark',
          borderColor: '$borderColorCardDark'
        }
      }}
      p="$4"
    >
      <HStack space="md" justifyContent="space-between" alignItems="center">
        {props.children}
      </HStack>
    </Box>
  )
}

export default ListItem
