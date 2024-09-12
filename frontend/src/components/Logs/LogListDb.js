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
  ButtonText,
  FlatList,
  Heading,
  HStack,
  Input,
  ScrollView,
  Text,
  View,
  VStack,
  useColorMode,
  SettingsIcon,
  CalendarDaysIcon,
} from '@gluestack-ui/themed'

import { AlertContext, ModalContext } from 'AppContext'
import { EditDatabase } from 'views/System/EditDatabase'
import LogListItem from './LogListItem'
import FilterInputSelect from './FilterInputSelect'
//import TimeInputSelect from './TimeInputSelect'
import { prettyToJSONPath } from './FilterSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'
import AlertChart from 'components/Alerts/AlertChart'
import EventTimelineChart from 'components/Alerts/EventTimelineChart'

import { countFields } from 'components/Alerts/AlertUtil'
import { TopicItem } from 'views/System/EditDatabase'

const LogList = (props) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const [topics, setTopics] = useState([])
  const [filter, setFilter] = useState({})
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 50
  const [params, setParams] = useState({ num: perPage })
  const [showForm, setShowForm] = useState(Platform.OS == 'web')
  const [searchField, setSearchField] = useState('')
  const [fieldCounts, setFieldCounts] = useState({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [selectRange, setSelectRange] = useState(false)
  const [multiMappingValues, setMultiMappingValues] = useState({})
  const colorMode = useColorMode()

  const [startDateTime, setStartDateTime] = useState(undefined);
  const [endDateTime, setEndDateTime] = useState(undefined);

  const handleStartDateTimeChange = (event) => {
    let newMin = new Date(event.target.value)
    if(!isNaN(newMin)) {
      setStartDateTime(newMin);
      if (selectRange) {
        let min = newMin.toISOString()
        setParams({ ...params, min })
      }
    }
  };

  const resetTime = (event) => {
    setStartDateTime(undefined)
    setEndDateTime(undefined)
    let max = new Date().toISOString()
    setParams({ ...params, min:0, max })
  }

  const handleEndDateTimeChange = (event) => {
    let newMax = new Date(event.target.value)
    if(!isNaN(newMax)) {
      setEndDateTime(newMax);

      if (selectRange) {
        let max = newMax.toISOString()
        setParams({ ...params, max })
      }

    }
  };


  const multiMappings = ['dns:serve:']

  const getMultiTopics = (mapping) => {
    return multiMappingValues[mapping] || []
  }

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleTimeline = () => {
    setShowTimeline(!showTimeline)
  }

  const toggleSelectRange = () => {
    if (selectRange) resetTime()
    setSelectRange(!selectRange)
  }

  useEffect(() => {
    //TODO map logs, merge timestamps
    let min = new Date('2023-01-12T00:00:00Z').toISOString()
    let max = new Date().toISOString()
    let num = perPage

    setParams({ ...params, num, max })

    dbAPI
      .buckets()
      .then((buckets) => {
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

        // multi-mappings
        for (let multi of multiMappings) {
          let multiValue = buckets.filter(n => n.startsWith(multi))
          buckets = buckets.filter(n => !n.startsWith(multi))
          buckets.push(multi)
          setMultiMappingValues(prev => ({ ...prev, [multi]: multiValue }))
        }


        setTopics(buckets)
      })
      .catch((err) => {
        context.error(`db plugin not running`)
      })
  }, [])

  useEffect(() => {
    let defaultFilters = ['wifi:auth:', 'dhcp:']
    let filter = {}
    topics.forEach((topic) => {
      filter[topic] = defaultFilters.some(def => topic.startsWith(def))
    })

    setFilter(filter)
  }, [topics])


  const getCurrentBuckets = () => Object.keys(filter).filter((k) => filter[k])

  const fetchLogs = async () => {
    const parseLog = (r, bucket) => {
      if (bucket == 'log:www:access') {
        r.msg = `${r.method} ${r.path}`
        r.level = r.remoteaddr
      }

      return { ...r, selected:bucket,  bucket: bucket.replace(/^log:/, '') }
    }

    // NOTE will only be one bucket for now
    //let buckets = Object.keys(filter).filter((k) => filter[k])
    //buckets.map(async (bucket) => {
    let buckets = getCurrentBuckets()
    if (buckets.length === 0) {
      return
    }

    let totalCount = 0
    let allLogs = []

    await Promise.all(buckets.map(async (bucket) => {
      let topics = [bucket]
      if (multiMappings.includes(bucket)) {
        topics = getMultiTopics(topics)
      }
      for (let topic of topics) {
        let stats = await dbAPI.stats(topic)
        totalCount += stats.KeyN

        let withFilter = { ...params, filter: prettyToJSONPath(searchField) }
        let result = await dbAPI.items(topic, withFilter)
        if (result == null) {
          result = []
        }
        result = result.map((r) => parseLog(r, bucket))
        allLogs = allLogs.concat(result)
      }
    }))

    setTotal(totalCount)

    // Sort all logs by timestamp
    allLogs.sort((a, b) => new Date(b.time) - new Date(a.time))

    const counts = countFields(allLogs)
    setFieldCounts(counts);

    //parse dates
    if (allLogs.length > 1) {
      //if wasnt set or its not active, set it
      //otherwise we cant update it properly.
      if (startDateTime === undefined || !selectRange) {
        setStartDateTime(new Date(allLogs[allLogs.length-1].time))
      }
      if (endDateTime === undefined || !selectRange) {
        setEndDateTime(new Date(allLogs[0].time))
      }
    }
    setLogs(allLogs)
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

  const handleTopicFilter = (topic) => {
    setLogs([])
    setFilter(prev => ({ ...prev, [topic]: !prev[topic] }))
  }


  const niceTopic = (topic) => topic && topic.replace(/^log:/, '')

  const SelectTopic = ({ options, selectedValue, onValueChange, ...props }) => {
    return (
      <Select
        size="xs"
        selectedValue={selectedValue}
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

  const handleBarClick = (label, count) => {
    let parts = label.split(':', 2)
    if (parts.length == 2) {
      setSearchField(parts[0] + '=="' + label.substr(parts[0].length+1) + '"')
    }
  };

  const formatDateForInput = (date) => {
    if (!date) {
      return
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>

      <VStack space="md" p="$4">


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
              topic={Object.keys(filter).find((f) => filter[f])}
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
            <Button
              variant="outline"
              onPress={toggleSelectRange}
            >
              <ButtonText>
              {!selectRange ? "Time" : "Clear"}
              </ButtonText>
            </Button>
            <Button
              variant="outline"
              onPress={toggleTimeline}
            >
              <ButtonText>
              {!showTimeline ? "Show Timeline" : "Show Log"}
              </ButtonText>
            </Button>
            <Button
              variant="outline"
              onPress={toggleExpand}
            >
              <ButtonText>
              {isExpanded ? "Hide Buckets" : "Show Buckets"}
              </ButtonText>
            </Button>
            <Tooltip label="Edit events & database settings">
              <Button
                variant="outline"
                action="primary"
                onPress={handlePressEdit}
              >
                <ButtonIcon as={SettingsIcon} color="$primary500" />
              </Button>
            </Tooltip>
          </HStack>

        </HStack>

        {isExpanded && (
          <ScrollView showsHorizontalScrollIndicator={false}>
          <HStack space="sm" flexWrap="wrap" mb="$1">
              {topics.map(topic => (

                <TopicItem
                  key={topic}
                  topic={topic}
                  onPress={() => handleTopicFilter(topic)}
                  isDisabled={!filter[topic]}
                />
              ))}
            </HStack>
          </ScrollView>
        )}

        {selectRange && (
        <HStack space="md" flexWrap="wrap">
          <VStack>
            <Text size="sm" fontWeight="$medium">Start Time</Text>
            <input
              placeholder="Select start date and time"
              value={formatDateForInput(startDateTime)}
              onChange={handleStartDateTimeChange}
              type="datetime-local"
            />
          </VStack>
          <VStack>
            <Text size="sm" fontWeight="$medium">End Time</Text>
            <input
              placeholder="Select end date and time"
              value={formatDateForInput(endDateTime)}
              onChange={handleEndDateTimeChange}
              type="datetime-local"
            />
          </VStack>
        </HStack>
      )}
      </VStack>

        {showTimeline ? (
          <EventTimelineChart topics={getCurrentBuckets()} data={logs} onBarClick={() => {}} />
        ) :
        ( <ScrollView>
            <AlertChart fieldCounts={fieldCounts} onBarClick={handleBarClick} />
            {total > perPage ? (
              <Pagination
                page={page}
                pages={total}
                perPage={perPage}
                onChange={(p) => updatePage(p, page)}
              />
            ) : null}
            <FlatList
              flex={2}
              data={logs}
              estimatedItemSize={100}
              renderItem={({ item }) => (
                <LogListItem item={item} selected={item.selected} />
              )}
              keyExtractor={(item, index) => item.time + index}
            />
          </ScrollView>
        )}
    </View>
  )
}

export default LogList
