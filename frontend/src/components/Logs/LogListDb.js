/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { dbAPI } from 'api'

import {
  Button,
  ButtonIcon,
  FlatList,
  Heading,
  HStack,
  Text,
  View,
  useColorMode,
  SettingsIcon
} from '@gluestack-ui/themed'

import { ModalContext } from 'AppContext'
import { EditDatabase } from 'views/System/EditDatabase'
import LogListItem from './LogListItem'
import FilterInputSelect from './FilterInputSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'

const LogList = (props) => {
  const modalContext = useContext(ModalContext)
  const [topics, setTopics] = useState([])
  const [filter, setFilter] = useState({})
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [showForm, setShowForm] = useState(Platform.OS == 'web')
  const [searchField, setSearchField] = useState('')

  const colorMode = useColorMode()

  useEffect(() => {
    //TODO map logs, merge timestamps
    let min = new Date('2023-01-12T00:00:00Z').toISOString()
    let max = new Date().toISOString()
    let num = 20

    setParams({ ...params, num, max })

    dbAPI.buckets().then((buckets) => {
      const ignoreList = ['alert:']
      for (let ignore of ignoreList) {
        buckets = buckets.filter((b) => !b.startsWith(ignore))
      }

      buckets.sort((a, b) => {
        //force dns to the end as each client has its own bucket.
        if (b.startsWith('dns:') && !a.startsWith('dns:')) {
          return -1
        }

        //and force log: to the top
        if (a.startsWith('log:') && !b.startsWith('log:')) {
          return -1
        }

        return a.localeCompare(b)
      })

      setTopics(buckets)
    })
  }, [])

  useEffect(() => {
    let filter = {}
    let defaultFilter = 'log:api'
    topics.map((topic) => {
      filter[topic] = topic == defaultFilter
    })

    setFilter(filter)
  }, [topics])

  const getCurrentBucket = () => Object.keys(filter).find((k) => filter[k])

  const fetchLogs = async () => {
    const parseLog = (r, bucket) => {
      if (bucket == 'log:www:access') {
        r.msg = `${r.method} ${r.path}`
        r.level = r.remoteaddr
      }

      return { ...r, bucket: bucket.replace(/^log:/, '') }
    }

    // NOTE will only be one bucket for now
    //let buckets = Object.keys(filter).filter((k) => filter[k])
    //buckets.map(async (bucket) => {
    let bucket = getCurrentBucket()
    if (!bucket) {
      return
    }

    let stats = await dbAPI.stats(bucket)
    setTotal(stats.KeyN)

    let withFilter = params
    withFilter['filter'] = searchField
    let result = await dbAPI.items(bucket, withFilter)
    if (result == null) {
      result = []
    }
    result = result.map((r) => parseLog(r, bucket))

    setLogs(result)
  }

  // fetch logs for selected filter
  useEffect(() => {
    // reset date start to now
    let max = new Date().toISOString()
    setParams({ ...params, max })
  }, [filter])

  useEffect(() => {
    setLogs([])
    fetchLogs()
  }, [params, searchField])

  const updatePage = (page, prevPage) => {
    //when page updates, fetch last log entry and use this as max ts for next page
    //just go to start if prev, we sort desc - new items fk it up
    //TODO rely on timestamps for pagination
    if (page < prevPage) {
      setParams({ ...params, max: new Date().toISOString() })
      setPage(1)
      return
    }

    let idx = logs.length - 1
    let l = logs[idx]
    if (l && l.time) {
      setParams({ ...params, max: l.time })
    }

    setPage(page)
  }

  // filter on/off - only one at a time atm.
  const handleTopicFilter = (topic) => {
    setLogs([])
    let newFilter = {}
    for (let k in filter) {
      newFilter[k] = k == topic ? !newFilter[k] : false
    }
    setFilter(newFilter)
    ///setFilter({ ...filter, [topic]: !filter[topic] })
  }

  const niceTopic = (topic) => topic && topic.replace(/^log:/, '')

  const SelectTopic = ({ options, selectedValue, onValueChange, ...props }) => {
    return (
      <Select
        size="xs"
        selectedValue={selectedValue}
        selectedLabel={selectedValue}
        onValueChange={onValueChange}
        minWidth="$32"
        maxWidth="$32"
        sx={{ '@md': { maxWidth: '$full' } }}
      >
        {options.map((value) => (
          <Select.Item key={value} label={niceTopic(value)} value={value} />
        ))}
      </Select>
    )
  }

  const handlePressEdit = () => {
    modalContext.modal(
      'Change database size limit',
      <EditDatabase onSubmit={() => {}} />
    )
  }

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <HStack space="md" p="$4" alignItems="center">
        <Heading size="sm">Events</Heading>
        <Text
          color="$muted500"
          sx={{
            '@base': { display: 'none' },
            '@md': { display: total ? 'flex' : 'none' }
          }}
        >
          {/*page={page}/{Math.ceil(total / perPage)}, total = {total}*/}
          {total} items
        </Text>

        <HStack
          display="none"
          sx={{
            '@md': {
              w: '$1/2',
              display: 'flex'
            }
          }}
        >
          <FilterInputSelect
            value={searchField}
            items={logs}
            onChangeText={setSearchField}
            onSubmitEditing={setSearchField}
          />
        </HStack>

        {/*
        <Tooltip label="Set filter for logs" ml="auto">
          <Button
            ml="auto"
            size="sm"
            action="secondary"
            variant="link"
            onPress={() => setShowForm(!showForm)}
          >
            <ButtonIcon
              as={showForm ? FilterXIcon : FilterIcon}
            />
          </Button>
        </Tooltip>
        */}
        <HStack space="sm" marginLeft="auto">
          <Tooltip label="Edit events & database settings">
            <Button
              variant="outline"
              action="primary"
              onPress={handlePressEdit}
            >
              <ButtonIcon as={SettingsIcon} color="$primary500" />
            </Button>
          </Tooltip>
          <SelectTopic
            options={Object.keys(filter)}
            selectedValue={Object.keys(filter).find((f) => filter[f])}
            onValueChange={handleTopicFilter}
          />
        </HStack>
      </HStack>

      <FlatList
        flex={2}
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <LogListItem item={item} selected={getCurrentBucket()} />
        )}
        keyExtractor={(item, index) => item.time + index}
      />

      {total > perPage ? (
        <Pagination
          page={page}
          pages={total}
          perPage={perPage}
          onChange={(p) => updatePage(p, page)}
        />
      ) : null}
    </View>
  )
}

export default LogList
