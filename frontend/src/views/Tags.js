import React, { useContext, useEffect, useState } from 'react'
import {
  Box,
  Divider,
  FlatList,
  Heading,
  HStack,
  View,
  SectionList,
  Text,
  VStack,
  useColorModeValue
} from 'native-base'

import { groupAPI, deviceAPI, nfmapAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { AlertContext } from 'layouts/Admin'
import Device from 'components/Devices/Device'

const DeviceItem = ({ device, ...props }) => {
  return (
    <HStack space={2}>
      <Text bold>{device.Name}</Text>
      <Text>{device.RecentIP}</Text>
      <Text>{device.MAC}</Text>
    </HStack>
  )
}

const Tags = (props) => {
  const context = useContext(AlertContext)
  const [tags, setTags] = useState([])

  const refreshTags = async () => {
    deviceAPI
      .list()
      .then((devices) => {
        let tagNames = Object.values(devices)
          .map((device) => {
            return device.DeviceTags
          })
          .flat()

        tagNames = [...new Set(tagNames)]

        let tags = tagNames.map((name) => {
          let data = Object.values(devices).filter((device) =>
            device.DeviceTags.includes(name)
          )

          return { name, data }
        })

        setTags(tags)
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  useEffect(() => {
    refreshTags()
  }, [])

  return (
    <View>
      <VStack space={4}>
        <Heading size="md">Tags</Heading>

        <SectionList
          sections={tags}
          _renderSectionFooter={({ section }) => <Divider my={2} />}
          renderSectionHeader={({ section: { name } }) => (
            <Box p={2} mt={4}>
              <Text bold>{name}</Text>
            </Box>
          )}
          renderItem={({ item, section }) => (
            <Box
              bg="backgroundCardLight"
              p={2}
              borderBottomWidth={1}
              borderBottomColor="muted.200"
              _dark={{
                bg: 'backgroundCardDark',
                borderBottomColor: 'muted.700'
              }}
            >
              <Device device={item} edit={false} />
            </Box>
          )}
          keyExtractor={(item, index) => `${index}`}
        />

        {/*tags.map((tag) => (
          <Text>{tag}</Text>
        ))*/}
      </VStack>
    </View>
  )
}

export default Tags
