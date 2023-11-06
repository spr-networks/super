/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { dbAPI } from 'api'
import { prettyDate } from 'utils'
import SyntaxHighlighter from 'react-native-syntax-highlighter'
import { github, ocean } from 'react-syntax-highlighter/styles/hljs'
import { Buffer } from 'buffer'

import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  ButtonIcon,
  FlatList,
  Heading,
  Link,
  HStack,
  VStack,
  Text,
  View,
  LinkText,
  useColorMode,
  CopyIcon,
  ScrollView
} from '@gluestack-ui/themed'

import { Settings2Icon } from 'lucide-react-native'

//import { FlashList } from '@shopify/flash-list'
import { EditDatabase } from 'views/System/EditDatabase'
import { ArrowLeftIcon, ArrowRightIcon } from '@gluestack-ui/themed'
import { ModalContext } from 'AppContext'
import { ListItem } from 'components/List'
import { Select } from 'components/Select'
import { Tooltip } from 'components/Tooltip'
import { copy } from 'utils'

const LogListItem = (props) => {
  return <></>
}

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

  const colorMode = useColorMode()

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
    if (!bucket) {
      return
    }

    let stats = await dbAPI.stats(bucket)
    setTotal(stats.KeyN)

    let result = await dbAPI.items(bucket, params)
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
      info: 'info',
      warning: 'warning',
      error: 'error',
      success: 'success'
    }
    return levels[level] || 'muted'
  }

  const niceTopic = (topic) => topic && topic.replace(/^log:/, '')

  //skip some properties
  const dumpJSON = (item, clean = false) => {
    let { time, bucket, ...rest } = item
    if (clean) {
      return JSON.stringify(rest, null, 2)
    }

    return JSON.stringify(rest)
  }

  const formatHexString = (buffer) => {
    let hexString = ''
    let asciiString = ''
    let resultString = ''

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i]
      hexString += byte.toString(16).padStart(2, '0')
      asciiString += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
      if (i % 8 === 7) hexString += '  '

      if (i % 16 === 15) {
        resultString += hexString + ' |' + asciiString + '|\n'
        hexString = ''
        asciiString = ''
      } else {
        hexString += ' '
      }
    }

    if (hexString) {
      const remainingBytes = buffer.length % 16
      if (remainingBytes <= 8) {
        hexString += ' '.repeat((8 - remainingBytes) * 3 + 1)
      } else {
        hexString += ' '.repeat((16 - remainingBytes) * 3)
      }
      resultString += hexString + '  | ' + asciiString
    }

    return resultString //.trimEnd();
  }

  const getPayloadHex = (obj) => {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === 'Payload' && typeof obj[key] === 'string') {
          const buffer = Buffer.from(obj[key], 'base64')
          const hexString = formatHexString(buffer)
          return hexString
        } else if (typeof obj[key] === 'object') {
          let ret = getPayloadHex(obj[key])
          if (ret) {
            return ret
          }
        }
      }
    }
    return null
  }

  const prettyEvent = (item) => {
    let hexLines = getPayloadHex(item)
    const syntaxTheme = colorMode == 'light' ? github : ocean

    if (!item.msg) {
      //TODO wrap items in scrollview if > x lines
      //<ScrollView maxHeight={150} borderColor="$muted200" borderWidth="$1"></ScrollView>
      return (
        <VStack
          space="md"
          alignItems="flex-end"
          sx={{ '@md': { flexDirection: 'row', alignItems: 'flex-start' } }}
        >
          <SyntaxHighlighter
            highlighter="hljs"
            language="json"
            style={syntaxTheme}
            wrapLongLines={true}
            lineProps={{ style: { flexWrap: 'wrap', lineHeight: 1.5 } }} // Adjusted line height
            customStyle={{
              backgroundColor: 'transparent'
            }}
          >
            {dumpJSON(item, true)}
          </SyntaxHighlighter>

          <Tooltip label="Copy JSON">
            <Button
              action="primary"
              variant="link"
              size="xs"
              display={item.msg ? 'none' : 'flex'}
              onPress={() => copy(JSON.stringify(item))}
              position="sticky"
              sx={{
                '@base': { right: '$0', marginTop: '-$10 ' },
                '@md': {
                  right: hexLines ? '$1/2' : '$0',
                  marginRight: '$10',
                  marginTop: '$0'
                }
              }}
            >
              <ButtonIcon as={CopyIcon} ml="$1" />
            </Button>
          </Tooltip>

          {hexLines ? (
            <SyntaxHighlighter
              language="brainfuck"
              style={syntaxTheme}
              customStyle={{
                backgroundColor: 'transparent'
              }}
            >
              {hexLines}
            </SyntaxHighlighter>
          ) : null}
        </VStack>
      )
    }

    return <Text size="sm">{item.msg}</Text>
  }

  const SelectTopic = ({ options, selectedValue, onValueChange, ...props }) => {
    return (
      <Select
        size="xs"
        selectedValue={selectedValue}
        selectedLabel={selectedValue}
        onValueChange={onValueChange}
        minWidth="$32"
      >
        {options.map((value) => (
          <Select.Item key={value} label={niceTopic(value)} value={value} />
        ))}
      </Select>
    )

    /*return (
      <>
        {options.map((topic, i) => (
          <Button
            key={`btn:${topic}:${filter[topic]}`}
            size="xs"
            action="primary"
            variant={topic == selectedValue ? 'solid' : 'outline'}
            rounded="xs"
            mb="$0.5"
            onPress={() => onValueChange(topic)}
          >
            <ButtonText>{niceTopic(topic)}</ButtonText>
          </Button>
        ))}
      </>
    )*/
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

  let h = Platform.OS == 'web' ? Dimensions.get('window').height - 64 : '100%'

  const handlePressEdit = () => {
    modalContext.modal(
      'Change database size limit',
      <EditDatabase onSubmit={() => {}} />
    )
  }

  return (
    <View h={h} display="flex">
      <HStack
        space="md"
        p="$4"
        alignItems="center"
        __sx={{ '@md': { flexDirection: 'row' } }}
      >
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
        <HStack space="sm" sx={{ '@md': { marginLeft: 'auto' } }}>
          <Button variant="outline" action="primary" onPress={handlePressEdit}>
            <ButtonIcon as={Settings2Icon} color="$primary500"></ButtonIcon>
          </Button>
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
          <ListItem alignItems="flex-start">
            <VStack space="sm" flex={1}>
              {prettyEvent(item)}
              <HStack space="sm">
                {getCurrentBucket() == 'log:api' && item.file && item.func ? (
                  <Link
                    color="$muted500"
                    isExternal
                    href={githubURL(item.file, getCurrentBucket())}
                  >
                    <LinkText size="sm">
                      {item.file}:{item.func}
                    </LinkText>
                  </Link>
                ) : null}
              </HStack>
            </VStack>
            <VStack
              space="sm"
              alignItems="flex-end"
              sx={{ '@base': { width: 80 }, '@md': { width: 'auto' } }}
            >
              <Text size="xs" textAlign="right">
                {prettyDate(item.time)}
              </Text>

              <Badge
                size="md"
                action={levelToColor(item.level)}
                variant="outline"
              >
                <BadgeText>{item.level || 'info'}</BadgeText>
              </Badge>
            </VStack>
          </ListItem>
        )}
        keyExtractor={(item, index) => item.time + index}
      />

      {total > perPage ? (
        <HStack space="md" alignItems="flex-start">
          <Button
            flex={1}
            variant="link"
            isDisabled={page <= 1}
            onPress={prevPage}
          >
            <ButtonIcon as={ArrowLeftIcon} mr="$1" />
            <ButtonText>Start</ButtonText>
          </Button>
          <Button
            flex={1}
            variant="link"
            isDisabled={page >= Math.ceil(total / perPage)}
            onPress={nextPage}
          >
            <ButtonText>Next</ButtonText>
            <ButtonIcon as={ArrowRightIcon} ml="$1" />
          </Button>
        </HStack>
      ) : null}
    </View>
  )
}

export default LogList
