import React, { useContext, useEffect, useState } from 'react'
import {
  SectionList,
  Center,
  Text,
  Heading,
  ScrollView,
  View,
  GlobeIcon
} from '@gluestack-ui/themed'

import { groupAPI, deviceAPI, nfmapAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { AlertContext } from 'layouts/Admin'

import Accordion from 'components/Accordion'
import { groupIcons } from 'components/IconItem'
import { groupDescriptions } from 'api/Group'

export default (props) => {
  const context = useContext(AlertContext)
  const [groups, setGroups] = useState([])

  const refreshGroups = async () => {
    let groups = []
    let devices = []

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
      device.Groups.map((g) => members[g] && members[g].push(device))
    }

    for (let group of groups) {
      group.Members = members[group.Name]
    }

    if (groups) {
      // get vmap for each group and show list
      for (const group of groups) {
        //other groups have _src_access, _dst_access maps
        //but we dont need to analyze those
        if (!['lan', 'wan', 'dns'].includes(group.Name)) {
          continue
        }
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

  const deleteGroup = (name) => {
    groupAPI
      .deleteGroup(name)
      .then(() => {
        refreshGroups()
      })
      .catch((err) => {
        context.error('API Failure, failed to delete group ' + err.message)
      })
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

  let items = groups.map((group) => ({
    label: group.Name,
    description: groupDescriptions[group.Name] || '',
    icon: groupIcons[group.Name] || GlobeIcon,
    renderItem: () => (
      <GroupListing key={group.Name} group={group} deleteGroup={deleteGroup} />
    )
  }))
  let open = ['wan']

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <Accordion items={items} open={open} />
    </ScrollView>
  )
}
