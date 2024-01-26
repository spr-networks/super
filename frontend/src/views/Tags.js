import React, { useContext, useEffect, useState } from 'react'
import {
  Box,
  HStack,
  ScrollView,
  SectionList,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { deviceAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import Device from 'components/Devices/Device'
import { ListHeader } from 'components/List'
import TagItem from 'components/TagItem'

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
          if (name == '') {
            name = 'Empty Tag Name'
          }
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
    <ScrollView h="$full">
      <VStack space="md">
        <ListHeader title="Tags" />

        <SectionList
          sections={tags}
          renderSectionHeader={({ section: { name } }) => (
            <HStack p="$4">
              {/*<TagItem
                bg="$blueGray600"
                color="$muted100"
                name={name}
                size="lg"
              />*/}
              <Text bold>{name}</Text>
            </HStack>
          )}
          renderItem={({ item, section }) => (
            <Device device={item} edit={false} />
          )}
          keyExtractor={(item, index) => `${index}`}
        />

        {!tags.length ? (
          <Text px="$4">No tags configured for devices or services</Text>
        ) : null}
      </VStack>
    </ScrollView>
  )
}

export default Tags
