import React from 'react'
import PropTypes from 'prop-types'

import { FlatList, Text } from '@gluestack-ui/themed'

import ListHeader from 'components/List/ListHeader'
import DNSOverrideListItem from './DNSOverrideListItem'

const DNSOverrideList = ({ title, listName, list, deleteListItem, ...props }) => {
  return (
    <>
      <ListHeader title={title} description="">
        {props.renderHeader ? props.renderHeader()  : null}
      </ListHeader>

      {!list || !list.length ? (
        <Text>{`No ${title.split(' ')[0]} rules configured`}</Text>
      ) : null}
      <FlatList
        data={list}
        renderItem={({ item }) => (
          <DNSOverrideListItem listName={listName} item={item} deleteListItem={deleteListItem} />
        )}
        keyExtractor={(item) => item.Domain}
      />
    </>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  listName: PropTypes.string.isRequired,
  list: PropTypes.array,
  notifyChange: PropTypes.func,
  deleteListItem: PropTypes.func
}

export default DNSOverrideList
