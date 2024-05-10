import React from 'react'
import { useNavigate } from 'react-router-native'

import {
  HStack,
  VStack,
  Pressable,
  Text,
  CloseIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import Device from 'components/Devices/Device'
import { SwipeListView } from 'components/SwipeListView'

const DeviceList = ({ list, deleteListItem, notifyChange, ...props }) => {
  const navigate = useNavigate()

  const renderItem = ({ item }) => (
    <Device
      key={item.MAC || item.WGPubKey} //keyExtractor is recommended, however, this fixes a bug on react web
      device={item}
      showMenu={true}
      notifyChange={notifyChange}
    />
  )

  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    closeRow(rowMap, rowKey)

    const newData = [...list]
    const prevIndex = list.findIndex(
      (item) => item.MAC === rowKey || item.WGPubKey == rowKey
    )
    newData.splice(prevIndex, 1)
    //setList(newData)
    deleteListItem(rowKey)
  }

  const renderHiddenItem = (data, rowMap) => (
    <HStack flex={1} pl="$2" my="$1">
      <Pressable
        w={70}
        ml="auto"
        cursor="pointer"
        bg="$coolGray200"
        justifyContent="center"
        disabled={data.item.MAC == 'pending'}
        onPress={() =>
          navigate(
            `/admin/devices/${
              data.item.MAC || encodeURIComponent(data.item.WGPubKey)
            }`
          )
        }
      >
        <VStack alignItems="center" space="md">
          <ThreeDotsIcon color="$coolGray800" />
          <Text size="xs" fontWeight="medium" color="$coolGray800">
            Edit
          </Text>
        </VStack>
      </Pressable>
      <Pressable
        w={70}
        cursor="pointer"
        bg="$red500"
        justifyContent="center"
        onPress={() => deleteRow(rowMap, data.item.MAC || data.item.WGPubKey)}
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
    <SwipeListView
      data={list}
      renderItem={renderItem}
      renderHiddenItem={renderHiddenItem}
      keyExtractor={(item, index) => item.MAC || item.WGPubKey || index}
      rightOpenValue={-140}
    />
  )
}

export default DeviceList
