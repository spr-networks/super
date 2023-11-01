import React from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  VStack,
  FlatList,
  HStack,
  Text,
  Button,
  ButtonIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import ListHeader from 'components/List/ListHeader'
import { ListItem } from 'components/List'

const DNSOverrideList = ({ title, list, ...props }) => {
  const context = React.useContext(AlertContext)

  const deleteListItem = async (item) => {
    blockAPI
      .deleteOverride(item)
      .then((res) => {
        props.notifyChange('config')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  return (
    <>
      <ListHeader title={title} description="Set rules for DNS queries">
        {props.renderHeader ? props.renderHeader() : null}
      </ListHeader>

      {!list || !list.length ? (
        <Text>{`No ${title.split(' ')[0]} rules configured`}</Text>
      ) : null}
      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <VStack
              sx={{ '@md': { flexDirection: 'row' } }}
              justifyContent="space-evenly"
              flex={1}
              space="md"
            >
              <VStack
                flex={1}
                space="md"
                sx={{ '@md': { flexDirection: 'row' } }}
              >
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
                  <Text>{item.ResultIP || '0.0.0.0'}</Text>
                </HStack>
              </VStack>

              <VStack
                flex={1}
                space="md"
                sx={{ '@md': { flexDirection: 'row' } }}
                justifyContent="space-between"
              >
                <HStack space={'md'}>
                  <Text color="$muted500">Client:</Text>
                  <Text>{item.ClientIP}</Text>
                </HStack>

                <HStack space={'md'}>
                  <Text color="$muted500">Expiration:</Text>
                  <Text>
                    {item.Expiration
                      ? timeAgo(new Date(item.Expiration * 1e3))
                      : 'Never'}
                  </Text>
                </HStack>
              </VStack>
            </VStack>

            <Button variant="link" onPress={() => deleteListItem(item)}>
              <ButtonIcon as={CloseIcon} color="$red700" />
            </Button>
          </ListItem>
        )}
        keyExtractor={(item) => item.Domain}
      />
    </>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  list: PropTypes.array,
  notifyChange: PropTypes.func
}

export default DNSOverrideList
