import React from 'react'
import PropTypes from 'prop-types'

import {
  HStack,
  Pressable,
  VStack,
  CloseIcon,
  Text
} from '@gluestack-ui/themed'

import ListHeader from 'components/List/ListHeader'
import { SwipeListView } from 'components/SwipeListView'
import DNSOverrideListItem from './DNSOverrideListItem'

const DNSOverrideList = ({
  title,
  listName,
  list,
  deleteListItem,
  ...props
}) => {
  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    closeRow(rowMap, rowKey)
    let item = list.find((l) => l.Domain == rowKey)
    deleteListItem(item)
  }

  const renderHiddenItem = (data, rowMap) => (
    <HStack flex={1} pl="$2">
      <Pressable
        w={70}
        ml="auto"
        cursor="pointer"
        bg="$red500"
        justifyContent="center"
        onPress={() => deleteRow(rowMap, data.item.Domain)}
      >
        <VStack alignItems="center" space="md">
          <CloseIcon color="$white" />
          <Text size="xs" color="$white" fontWeight="$medium">
            Delete
          </Text>
        </VStack>
      </Pressable>
    </HStack>
  )

  return (
    <>
      <ListHeader title={title} description="Set rules for DNS queries">
        {props.renderHeader ? props.renderHeader() : null}
      </ListHeader>

      <SwipeListView
        data={list}
        renderItem={({ item }) => (
          <DNSOverrideListItem
            listName={listName}
            item={item}
            deleteListItem={deleteListItem}
          />
        )}
        renderHiddenItem={renderHiddenItem}
        keyExtractor={(item, index) => item.Domain}
        rightOpenValue={-70}
      />

      {!list || !list.length ? (
        <Text>{`No ${title.split(' ')[0]} rules configured`}</Text>
      ) : null}
    </>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  list: PropTypes.array,
  listName: PropTypes.string,
  notifyChange: PropTypes.func,
  deleteListItem: PropTypes.func
}

export default DNSOverrideList
