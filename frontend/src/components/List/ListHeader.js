import React from 'react'

import {
  Heading,
  VStack,
  HStack,
  Text,
  Button,
  ButtonIcon,
  ButtonText,
  AddIcon
} from '@gluestack-ui/themed'

const ListHeader = ({ title, description, ...props }) => {
  /*
      <Button size="sm" action="secondary" variant="outline">
        <ButtonIcon as={AddIcon} />
        <ButtonText>Add stuff</ButtonText>
      </Button>
  */
  return (
    <HStack justifyContent="space-between" alignItems="center" p="$4">
      <VStack sx={{ '@md': { flexDirection: 'row' } }} space="sm">
        <Heading size="md">{title}</Heading>
        <Text color="$muted500">{description}</Text>
      </VStack>

      {props.children}
    </HStack>
  )
}

export default ListHeader
