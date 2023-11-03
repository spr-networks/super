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
      p="$2"
      px="$3"
      space="sm"
      sx={{
        '@md': {
          p: '$4',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 'md'
        }
      }}
    >
      <VStack
        sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
        space="sm"
      >
        <Text size="md" bold>
          {title}
        </Text>
        {description ? (
          <Text size="sm" color="$muted500">
            {description}
          </Text>
        ) : null}
        {/*description && typeof description !== 'string' ? (
          <>{description}</>
        ) : null*/}
      </VStack>

      {props.children}
    </VStack>
  )
}

export default ListHeader

ListHeader.propTypes = {
  title: PropTypes.string,
  description: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
}
