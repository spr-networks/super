import React, { useContext, useEffect, useState } from 'react'
import {
  SectionList,
  Center,
  Text,
  Heading,
  ScrollView,
  View
} from '@gluestack-ui/themed'

import { groupAPI, deviceAPI, nfmapAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { AlertContext } from 'layouts/Admin'

export default (props) => {
  const context = useContext(AlertContext)
  const [groups, setGroups] = useState([])

  const refreshGroups = async () => {
    let groups
    let devices

    try {
      groups = await groupAPI.list()
      devices = await deviceAPI.list()
    } catch (error) {
      context.error('API Failure: ' + error.message)
    }

    let members = {}
    for (const group of groups) {
      members[group.Name] = []
    }

    for (let MAC in devices) {
      let device = devices[MAC]
      for (const entry of device.Groups) {
        members[entry].push(device)
      }
    }

    for (let group of groups) {
      group.Members = members[group.Name]
    }

    if (groups) {
      // get vmap for each group and show list
      for (const group of groups) {
        const vmap = await nfmapAPI
          .getNFVerdictMap(group.Name)
          .catch((error) => {
            //404 = no clients in map yet
            if (error.message !== 404) {
              context.error('API Failure for: ' + v.Name + ' ' + error.message)
            }
          })

        group.vmap = vmap
      }

      setGroups(groups)
    }
  }

  useEffect(() => {
    refreshGroups()
  }, [])

  /*
  const listData = [
    {
      title: 'Header 1',
      data: { stuff: ['hello', 'hihi'] }
    },
    {
      title: 'Header 2',
      data: { stuff: ['dada', 'data'] }
    }
  ]

  return (
    <SectionList
      __sections={groups.map((group) => {
        return { title: group.Name, data: group }
      })}
      sections={listData}
      renderSectionHeader={({ section: { title } }) => <Text>{title}</Text>}
      renderItem={(a) => <Text>{JSON.stringify(a.item)}</Text>}
      keyExtractor={(item, index) => index}
    />
  )
  */

  return (
    <ScrollView sx={{ '@md': { h: '90vh' } }}>
      {groups.map((group) => (
        <GroupListing key={group.Name} group={group} />
      ))}
    </ScrollView>
  )

  /*
  let data = [
    {
      title: 'Cyan',
      data: ['$cyan100', '$cyan200', '$cyan300', '$cyan400', '$cyan500']
    },
    { title: 'Yellow', data: ['$yellow100', '$yellow200', '$yellow300'] }
  ]

  return (
    <>
      <SectionList
        minWidth={300}
        mb="$4"
        sections={data}
        keyExtractor={(item, index) => item + index}
        renderItem={({ item }) => (
          <Center py="$4" bg={item}>
            <Text color="$black">
              {typeof item === 'string' ? item.slice(-3) : ''}
            </Text>
          </Center>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <Center>
            <Heading fontSize="$xl" mt="$8" pb="$4">
              {title}
            </Heading>
          </Center>
        )}
      />
    </>
  )
  */
}
