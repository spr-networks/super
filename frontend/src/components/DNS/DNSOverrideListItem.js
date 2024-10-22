import React from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'

import { format as timeAgo } from 'timeago.js'

import {
  VStack,
  HStack,
  Text,
  Button,
  ButtonIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListItem } from 'components/List'

const DNSOverrideListItem = ({ item, listName, deleteListItem, ...props }) => {
  return (
    <ListItem>
      <VStack
        sx={{ '@md': { flexDirection: 'row' } }}
        justifyContent="space-evenly"
        flex={1}
        space="sm"
      >
        <VStack flex={1} space="md" sx={{ '@md': { flexDirection: 'row' } }}>
          <Text bold>{item.Domain}</Text>
          <HStack space={'md'}>
            <Text
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex' }
              }}
              color="$muted500"
            >
              =
            </Text>
            <Text>{item.ResultIP || item.ResultCNAME || '0.0.0.0'}</Text>
          </HStack>
        </VStack>

        <VStack
          flex={1}
          space="sm"
          sx={{ '@md': { flexDirection: 'row' } }}
          justifyContent="space-between"
        >
          <HStack space="md">
            <Text color="$muted500">Client:</Text>
            <Text>{item.ClientIP}</Text>
          </HStack>

          <HStack space="md">
            <Text color="$muted500">Expiration:</Text>
            <Text>
              {item.Expiration
                ? timeAgo(new Date(item.Expiration * 1e3))
                : 'Never'}
            </Text>
          </HStack>
        </VStack>
      </VStack>

      <Button
        display={Platform.OS == 'web' ? 'flex' : 'none'}
        variant="link"
        onPress={() => deleteListItem(listName, item)}
      >
        <ButtonIcon as={CloseIcon} color="$red700" />
      </Button>
    </ListItem>
  )
}

DNSOverrideListItem.propTypes = {
  item: PropTypes.object.isRequired,
  listName: PropTypes.string.isRequired, 
  deleteListItem: PropTypes.func
}

export default DNSOverrideListItem
