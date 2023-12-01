import React from 'react'
import PropTypes from 'prop-types'

import { HStack, VStack, Icon, Text, InfoIcon } from '@gluestack-ui/themed'

import { Tooltip } from 'components/Tooltip'

const ListHeader = ({ title, description, info, ...props }) => {
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
        <HStack space="sm">
          {description ? (
            <Text size="sm" color="$muted500">
              {description}
            </Text>
          ) : null}
          {info ? (
            <Tooltip label={info}>
              <Icon as={InfoIcon} color="$muted500" />
            </Tooltip>
          ) : null}
        </HStack>
      </VStack>

      {props.children}
    </VStack>
  )
}

export default ListHeader

ListHeader.propTypes = {
  title: PropTypes.string,
  description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  info: PropTypes.string
}
