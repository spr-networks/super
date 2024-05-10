import React from 'react'

import { FlatList } from '@gluestack-ui/themed'

import Device from 'components/Devices/Device'

const DeviceList = ({ list, deleteListItem, notifyChange, ...props }) => {
  const renderItem = ({ item }) => (
    <Device
      key={item.MAC || item.WGPubKey} //keyExtractor is recommended, however, this fixes a bug on react web
      device={item}
      showMenu={true}
      notifyChange={notifyChange}
    />
  )

  return (
    <FlatList
      data={list}
      renderItem={renderItem}
      estimatedItemSize={120}
      contentContainerStyle={{ paddingBottom: 32 }}
    />
  )
}

export default DeviceList
