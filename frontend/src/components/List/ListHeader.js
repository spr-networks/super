import React from 'react'
import PropTypes from 'prop-types'

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
    <VStack
      justifyContent="space-between"
      p="$4"
      space="md"
      sx={{ '@md': { flexDirection: 'row', alignItems: 'center', gap: 'md' } }}
    >
      <HStack
        sx={{ '@md': { flexDirection: 'row' } }}
        space="sm"
        alignItems="center"
      >
        <Heading size="sm">{title}</Heading>
        <Text size="sm" color="$muted500">
          {description}
        </Text>
      </HStack>

      {props.children}
    </VStack>
  )
}

export default ListHeader

ListHeader.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string
}