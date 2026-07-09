import React, { Fragment, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Fab,
  FabIcon,
  FabLabel,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  VStack,
  AddIcon,
  CheckIcon,
  SettingsIcon,
  HStack,
  useColorMode
} from '@gluestack-ui/themed'

import { Settings2Icon } from 'lucide-react-native'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import AlertChart from 'components/Alerts/AlertChart'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { prettyToJSONPath } from 'components/Logs/FilterSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'
import { countFields } from 'components/Alerts/AlertUtil'

import AlertListItem from 'components/Alerts/AlertListItem'

const Alerts = (props) => {
  const [config, setConfig] = useState([])
  const [topics, setTopics] = useState([])
  const [bucketCounts, setBucketCounts] = useState({})
  const [selectedBucket, setSelectedBucket] = useState(null)
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  const [fieldCounts, setFieldCounts] = useState({})

  const AlertPrefix = 'alert:'

  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [searchField, setSearchField] = useState('')
  const [stateFilter, setStateFilter] = useState('New')

  const prettyBucket = (bucket) => {
    let newName = bucket.replace(AlertPrefix, '')
    if (newName === '') {
      return 'Alerts'
    }
    return newName
  }
  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  const severityOf = (item, ruleSeverity = {}) => {
    //older stored events lack NotificationType; fall back to the rule's current one
    let level = item.NotificationType || ruleSeverity[item.RuleId] || ''
    if (level == 'error' || level == 'danger') return 'error'
    if (level == 'warning') return 'warning'
    return 'info'
  }

  const countMax = 100

  const fetchAlertBuckets = async () => {
    let ruleSeverity = {}
    try {
      const rules = await alertsAPI.list()
      setConfig(rules)
      for (const rule of rules || []) {
        const level = rule.Actions?.[0]?.NotificationType
        if (rule.RuleId && level) {
          ruleSeverity[rule.RuleId] = level
        }
      }
    } catch (err) {}

    let buckets = await dbAPI.buckets()
    buckets = buckets.filter((b) => b.startsWith(AlertPrefix))
    buckets.sort()

    let withFilter = { ...params, num: countMax }
    if (searchField && searchField !== '') {
      withFilter['filter'] = prettyToJSONPath(searchField)
    } else {
      withFilter['filter'] = ''
    }

    const counts = {}
    await Promise.allSettled(
      buckets.map(async (bucket) => {
        const result = await dbAPI.items(bucket, withFilter)
        if (!result) return
        const filterFuncs = {
          Resolved: (item) => item.State === 'Resolved',
          New: (item) => item.State !== 'Resolved'
        }
        const filterFunc = filterFuncs[stateFilter] || ((item) => item)
        const items = result.filter(filterFunc)
        counts[prettyBucket(bucket)] = {
          total: items.length,
          error: items.filter((item) => severityOf(item, ruleSeverity) == 'error')
            .length,
          warning: items.filter(
            (item) => severityOf(item, ruleSeverity) == 'warning'
          ).length
        }
      })
    )

    //most severe buckets first
    const rank = (bucket) => {
      const c = counts[prettyBucket(bucket)] || { total: 0, error: 0, warning: 0 }
      return c.error * 1e6 + c.warning * 1e3 + c.total
    }
    buckets.sort((a, b) => rank(b) - rank(a))

    setTopics(buckets)
    setBucketCounts(counts)
  }

  const fetchLogs = async () => {
    let result = []
    let bucket = selectedBucket

    let withFilter = params
    if (searchField) {
      withFilter['filter'] = prettyToJSONPath(searchField)
    } else {
      withFilter['filter'] = ''
    }

    let more_results = await dbAPI.items(bucket, withFilter)
    if (more_results) {
      more_results = more_results.map((entry) => {
        entry.AlertTopic = bucket
        entry.State = entry.State || 'New' // '' == 'New'
        return entry
      })

      if (stateFilter != 'All') {
        more_results = more_results.filter(
          (alert) => alert.State == stateFilter
        )
      }

      const counts = countFields(more_results, true)

      setFieldCounts(counts)

      result = result.concat(more_results)
    }
    setLogs(result)
  }

  /*
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedBucket) {
        fetchList()
        fetchAlertBuckets()
      }
    }, 1000)

    return () => clearTimeout(timer) // this will clear the timer in case inputValue changes within 2 seconds
  }, [params, searchField, stateFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedBucket) {
        fetchLogs()
      }
    }, 1000)

    return () => clearTimeout(timer) // this will clear the timer in case inputValue changes within 2 seconds
  }, [selectedBucket, params, searchField, stateFilter])
*/

  useEffect(() => {
    if (selectedBucket) {
      fetchLogs()
    }
  }, [selectedBucket, params, searchField, stateFilter])

  useEffect(() => {
    fetchAlertBuckets()
  }, [params, searchField, stateFilter])

  //TODO
  /*const onDelete = (index) => {
    alertsAPI.remove(index).then((res) => {
      let _alerts = [...config]
      delete config[index]
      setConfig(_alerts)
    })
  }

  const onToggle = (index, item) => {
    item.Disabled = !item.Disabled

    alertsAPI.update(index, item).then((res) => {
      let _alerts = [...config]
      _alerts[index] = item
      setConfig(_alerts)
    })
  }*/

  const onSubmit = (item) => {
    //submit to api
    alertsAPI
      .add(item)
      .then((res) => {
        refModal.current()
        fetchList()
      })
      .catch((err) => {
        context.error('failed to save rule', err)
      })
  }

  const onChangeStateFilter = (value) => {
    setStateFilter(value)
  }

  const refModal = useRef(null)

  const stateChoices = ['New', 'Resolved', 'All']

  const dayLabel = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(Date.now() - 24 * 3600e3)
    if (date.toDateString() == today.toDateString()) return 'Today'
    if (date.toDateString() == yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString()
  }

  const withDayDividers = (items) => {
    const rows = []
    let lastDay = null
    for (const item of items) {
      const day = dayLabel(item.time)
      if (day != lastDay) {
        rows.push({ dayDivider: day })
        lastDay = day
      }
      rows.push(item)
    }
    return rows
  }

  const options = stateChoices.map((value) => ({
    label: value,
    value
  }))

  const onChangeEvent = (event) => {
    let logsUpdated = logs.map((l) => (l.time == event.time ? event : l))
    setLogs(logsUpdated)
    fetchAlertBuckets()
  }

  const resolveAll = async () => {
    if (!selectedBucket) {
      return
    }

    let withFilter = { ...params, num: 500 }
    withFilter['filter'] = searchField ? prettyToJSONPath(searchField) : ''

    let items = (await dbAPI.items(selectedBucket, withFilter)) || []
    let unresolved = items.filter((l) => l.State != 'Resolved')
    if (!unresolved.length) {
      return
    }

    await Promise.all(
      unresolved.map((event) =>
        dbAPI.putItem(selectedBucket, `timekey:${event.time}`, {
          ...event,
          State: 'Resolved'
        })
      )
    )

    context.success(`Resolved ${unresolved.length} alerts`)
    fetchLogs()
    fetchAlertBuckets()
  }

  const handleBarClick = (label, count) => {
    let parts = label.split(':', 2)
    if (parts.length == 2) {
      setSearchField(
        'Event.' + parts[0] + '=="' + label.substr(parts[0].length + 1) + '"'
      )
    }
  }

  const colorMode = useColorMode()

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alerts">
        <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
          {
            <FilterInputSelect
              NoFilterCommon={true}
              topic={selectedBucket}
              value={searchField}
              items={logs}
              onChangeText={setSearchField}
              onSubmitEditing={setSearchField}
              display="none"
              sx={{
                '@md': {
                  display: 'flex',
                  width: 300
                }
              }}
            />
          }
          <HStack
            borderRadius={8}
            borderWidth={1}
            borderColor="$muted200"
            sx={{ _dark: { borderColor: '$muted800' } }}
            p="$0.5"
            alignSelf="flex-start"
          >
            {stateChoices.map((choice) => (
              <Button
                key={choice}
                size="xs"
                variant={stateFilter == choice ? 'solid' : 'link'}
                action={stateFilter == choice ? 'primary' : 'secondary'}
                onPress={() => onChangeStateFilter(choice)}
                px="$3"
              >
                <ButtonText>{choice}</ButtonText>
              </Button>
            ))}
          </HStack>

          <ModalForm
            title="Add Alert"
            triggerText="Add Alert"
            triggerProps={{
              display: 'none',
              action: 'secondary',
              variant: 'solid'
            }}
            modalRef={refModal}
          >
            <AddAlert onSubmit={onSubmit} />
          </ModalForm>
          {/*<Button
            action="primary"
            variant="outline"
            size="sm"
            onPress={() => navigate(`/admin/alerts`)}
          >
            <ButtonText>Settings</ButtonText>
            <ButtonIcon as={SettingsIcon} ml="$2" />
          </Button>*/}
          <Button
            action="primary"
            variant="solid"
            size="sm"
            onPress={resolveAll}
          >
            <ButtonText>Resolve All</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$2" />
          </Button>
        </VStack>
      </ListHeader>

      {topics.map(
        (bucket) =>
          bucketCounts[prettyBucket(bucket)]?.total !== 0 && (
            <Fragment key={bucket}>
              <Pressable
                onPress={() =>
                  setSelectedBucket(selectedBucket === bucket ? null : bucket)
                }
              >
                <HStack
                  p="$4"
                  space="md"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor={
                    colorMode == 'light' ? '$coolGray200' : '$coolGray800'
                  }
                >
                  <Text sx="$md" bold>
                    {prettyBucket(bucket)}
                  </Text>
                  {(() => {
                    const counts = bucketCounts[prettyBucket(bucket)]
                    if (!counts) return null
                    const rest = counts.total - counts.error - counts.warning
                    const chip = (action, value, key) => (
                      <Badge
                        key={key}
                        action={action}
                        borderRadius={'$full'}
                        variant={action == 'muted' ? 'outline' : 'solid'}
                        size="md"
                      >
                        <BadgeText>
                          {value >= countMax ? countMax - 1 + '+' : value}
                        </BadgeText>
                      </Badge>
                    )
                    return (
                      <HStack space="xs">
                        {counts.error > 0 ? chip('error', counts.error, 'e') : null}
                        {counts.warning > 0
                          ? chip('warning', counts.warning, 'w')
                          : null}
                        {rest > 0 || counts.total == 0
                          ? chip('muted', rest, 'm')
                          : null}
                      </HStack>
                    )
                  })()}
                </HStack>
              </Pressable>
              {selectedBucket === bucket && (
                <ScrollView>
                  <AlertChart
                    fieldCounts={fieldCounts}
                    onBarClick={handleBarClick}
                  />
                  <FlatList
                    data={withDayDividers(logs)}
                    estimatedItemSize={100}
                    renderItem={({ item }) =>
                      item.dayDivider ? (
                        <Text
                          size="xs"
                          bold
                          color="$muted500"
                          px="$4"
                          py="$2"
                        >
                          {item.dayDivider}
                        </Text>
                      ) : (
                        <VStack>
                          <AlertListItem
                            item={item}
                            notifyChange={onChangeEvent}
                          />
                        </VStack>
                      )
                    }
                    keyExtractor={(item, index) =>
                      (item.dayDivider || item.time) + index
                    }
                    contentContainerStyle={{ paddingBottom: 48 }}
                  />
                </ScrollView>
              )}
            </Fragment>
          )
      )}

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={() => navigate(`/admin/alerts/new`)}
        bg="$primary500"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add</FabLabel>
      </Fab>
      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={() => navigate(`/admin/alerts`)}
        bg="$secondary500"
        mr="$20"
      >
        <FabIcon as={Settings2Icon} mr="$1" />
        <FabLabel>Settings</FabLabel>
      </Fab>
    </View>
  )
}

export default Alerts
