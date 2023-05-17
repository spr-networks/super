/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { logsAPI, dbAPI } from 'api'
import InputSelect from 'components/InputSelect'
import { prettyDate } from 'utils'
import { AlertContext } from 'layouts/Admin'

import {
  Badge,
  Box,
  Button,
  FlatList,
  Heading,
  Stack,
  Link,
  HStack,
  VStack,
  ScrollView,
  Text,
  View,
  useColorModeValue,
  Tooltip
} from 'native-base'

import { FlashList } from '@shopify/flash-list'
import Icon from 'FontAwesomeUtils'
import {
  faFilter,
  faFilterCircleXmark
} from '@fortawesome/free-solid-svg-icons'

const LogListItem = (props) => {
  return <></>
}

const LogList = (props) => {
  const [topics, setTopics] = useState([])
  const [filter, setFilter] = useState({})
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [showForm, setShowForm] = useState(Platform.OS == 'web')

  useEffect(() => {
    //TODO map logs, merge timestamps
    let min = new Date('2023-01-12T00:00:00Z').toISOString()
    let max = new Date().toISOString()
    let num = 20

    setParams({ ...params, num, max })

    dbAPI.buckets().then((buckets) => {
      buckets.sort((a, b) => {
        if (a.startsWith('log:') && !b.startsWith('log:')) {
          return -1
        }

        return a.localeCompare(b)
      })

      setTopics(buckets)
      //only log: prefix
      //setTopics(buckets.filter((b) => b.startsWith('log:')))
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
    let stats = await dbAPI.stats(bucket)
    setTotal(stats.KeyN)

    let result = await dbAPI.items(bucket, params)
    result = result.map((r) => parseLog(r, bucket))

    setLogs(result)
  }

  // fetch logs for selected filter
  useEffect(async () => {
    // reset date start to now
    let max = new Date().toISOString()
    setParams({ ...params, max })
  }, [filter])

  useEffect(() => {
    setLogs([])
    fetchLogs()
  }, [params])

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

  const prevPage = () => updatePage(page > 1 ? page - 1 : 1, page)
  const nextPage = () => updatePage(page + 1, page)

  // filter on/off - only one at a time atm.
  const handleTopicFilter = (topic) => {
    let newFilter = {}
    for (let k in filter) {
      newFilter[k] = k == topic ? !newFilter[k] : false
    }
    setFilter(newFilter)
    ///setFilter({ ...filter, [topic]: !filter[topic] })
  }

  const levelToColor = (level) => {
    let levels = {
      info: 'blueGray',
      warning: 'orange',
      error: 'danger',
      success: 'success'
    }
    return levels[level] || 'blueGray'
  }

  let h = Platform.OS == 'web' ? Dimensions.get('window').height - 64 : '100%'

  const niceTopic = (topic) => topic && topic.replace(/^log:/, '')

  //skip some properties
  const dumpJSON = (item) => {
    let { time, bucket, ...rest } = item
    return JSON.stringify(rest)
  }

  //TODO support other containers
  //NOTE this will not work if running an older version
  const githubURL = (filename, bucket) => {
    if (
      bucket != 'log:api' ||
      !filename.match(/^[a-z0-9\/_]+.go:[0-9]+$/gi, '')
    ) {
      return null
    }

    let containerDir = 'api'
    let url = `https://github.com/spr-networks/super/blob/main/${containerDir}/`
    filename = filename.replace(':', '#L') // line no
    return url + filename
  }

  return (
    <View h={h} display="flex">
      <HStack space={2} p={4} alignItems={'flex-end'}>
        <Heading fontSize="lg">Logs: {niceTopic(getCurrentBucket())}</Heading>
        <Text color="muted.500" mt="auto" display={total ? 'block' : 'none'}>
          {/*page={page}/{Math.ceil(total / perPage)}, total = {total}*/}
          {total} items
        </Text>
        <Tooltip label="Set filter for logs">
          <Button
            ml="auto"
            size="sm"
            variant="ghost"
            colorScheme="blueGray"
            leftIcon={<Icon icon={showForm ? faFilterCircleXmark : faFilter} />}
            onPress={() => setShowForm(!showForm)}
          />
        </Tooltip>
      </HStack>

      <HStack
        space={2}
        px={4}
        pb={2}
        display={showForm ? 'flex' : 'none'}
        flexWrap="wrap"
      >
        {Object.keys(filter).map((topic) => (
          <Button
            key={`btn:${topic}:${filter[topic]}`}
            variant={filter[topic] ? 'solid' : 'outline'}
            colorScheme={'blueGray'}
            rounded="xs"
            size="sm"
            py={1}
            mb={2}
            onPress={() => handleTopicFilter(topic)}
          >
            {niceTopic(topic)}
          </Button>
        ))}
      </HStack>
      <FlashList
        flex={2}
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <Box
            bg="backgroundCardLight"
            borderBottomWidth={1}
            _dark={{
              bg: 'backgroundCardDark',
              borderColor: 'borderColorCardDark'
            }}
            borderColor="borderColorCardLight"
            p={4}
          >
            <HStack space={2}>
              <VStack space={1} flex={1}>
                <Text>{item.msg || dumpJSON(item)}</Text>
                <HStack space={1}>
                  {/*<Text color={'muted.500'} bold>
                    {item.bucket}
                  </Text>*/}
                  {getCurrentBucket() == 'log:api' && item.file && item.func ? (
                    <Link
                      color={'muted.500'}
                      isExternal
                      href={githubURL(item.file, getCurrentBucket())}
                    >
                      {item.file}:{item.func}
                    </Link>
                  ) : null}
                </HStack>
              </VStack>
              <VStack space={1}>
                <Badge
                  variant={'outline'}
                  colorScheme={levelToColor(item.level)}
                >
                  {item.level || 'info'}
                </Badge>

                <Text>{prettyDate(item.time)}</Text>
              </VStack>
            </HStack>
          </Box>
        )}
        keyExtractor={(item, index) => item.time + index}
      />

      {total > perPage ? (
        <HStack space={2} alignItems="flex-start">
          <Button
            flex={1}
            variant="ghost"
            isDisabled={page <= 1}
            onPress={prevPage}
          >
            &larr; Start
          </Button>
          <Button
            flex={1}
            variant="ghost"
            isDisabled={page >= Math.ceil(total / perPage)}
            onPress={nextPage}
          >
            Next &rarr;
          </Button>
        </HStack>
      ) : null}
    </View>
  )
}

export default LogList
