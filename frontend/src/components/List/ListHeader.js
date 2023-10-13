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
    <HStack justifyContent="space-between" alignItems="center" p="$4">
      <VStack
        sx={{ '@md': { flexDirection: 'row' } }}
        space="sm"
        alignItems="center"
      >
        <Heading size="sm">{title}</Heading>
        <Text size="sm" color="$muted500">
          {description}
        </Text>
      </VStack>

      {props.children}
    </HStack>
  )
}

export default ListHeader

ListHeader.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string
}
