import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  CheckIcon,
  Heading,
  HStack,
  Icon,
  Pressable,
  ScrollView,
  Text,
  View,
  VStack
} from '@gluestack-ui/themed'

import {
  AlertTriangleIcon,
  BellIcon,
  ChevronRightIcon,
  InboxIcon,
  PlusIcon
} from 'lucide-react-native'

import { alertsAPI, dbAPI } from 'api'
import AlertChart from 'components/Alerts/AlertChart'
import { AlertContext, AppContext } from 'AppContext'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { countFields } from 'components/Alerts/AlertUtil'
import {
  filterAlertsBySearch,
  getAlertServerFilter
} from 'components/Alerts/AlertSearchUtil'
import {
  filterAlertsByState,
  isAlertResolved,
  normalizeAlertState
} from 'components/Alerts/AlertStateUtil'
import AlertListItem from 'components/Alerts/AlertListItem'

const AlertPrefix = 'alert:'
const countMax = 100
const searchMax = 500

const Alerts = () => {
  const [topics, setTopics] = useState([])
  const [bucketCounts, setBucketCounts] = useState({})
  const [topicLabels, setTopicLabels] = useState({})
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [fieldCounts, setFieldCounts] = useState({})
  const [logs, setLogs] = useState([])
  const [bucketItems, setBucketItems] = useState({ query: null, items: {} })
  const [loading, setLoading] = useState(true)
  const [params] = useState({ num: 20 })
  const [searchField, setSearchField] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [stateFilter, setStateFilter] = useState('New')
  const bucketRequest = useRef(0)
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const navigate = useNavigate()
  const prettyBucket = (bucket) => {
    const name = bucket.replace(AlertPrefix, '')
    return name || 'Alerts'
  }

  const severityOf = (item, ruleSeverity = {}) => {
    const level = item.NotificationType || ruleSeverity[item.RuleId] || ''
    if (level === 'error' || level === 'danger') return 'error'
    if (level === 'warning') return 'warning'
    return 'info'
  }

  const labelForBucket = (bucket, rules) => {
    const rawName = prettyBucket(bucket)
    const matchingRule = (rules || [])
      .filter(
        (rule) => rule.TopicPrefix && rawName.startsWith(rule.TopicPrefix)
      )
      .sort((a, b) => b.TopicPrefix.length - a.TopicPrefix.length)[0]
    return (
      matchingRule?.Name || rawName.replace(/:+$/, '').replace(/:/g, ' · ')
    )
  }

  const normalizeBucketItems = (items, bucket, contextValues = []) =>
    filterAlertsBySearch(
      (items || []).map((item) => ({
        ...item,
        AlertTopic: bucket,
        State: normalizeAlertState(item.State)
      })),
      searchQuery,
      appContext.devices || [],
      contextValues
    )

  const fetchAlertBuckets = async () => {
    const requestId = ++bucketRequest.current
    if (topics.length === 0) setLoading(true)
    const ruleSeverity = {}

    try {
      const rules = await alertsAPI.list()
      for (const rule of rules || []) {
        const level = rule.Actions?.[0]?.NotificationType
        if (rule.RuleId && level) ruleSeverity[rule.RuleId] = level
      }

      let buckets = await dbAPI.buckets()
      buckets = buckets.filter((bucket) => bucket.startsWith(AlertPrefix))

      const filterParams = {
        ...params,
        num: searchQuery ? searchMax : countMax,
        filter: getAlertServerFilter(searchQuery)
      }
      const counts = {}
      const itemsByBucket = {}
      const labels = Object.fromEntries(
        buckets.map((bucket) => [bucket, labelForBucket(bucket, rules)])
      )

      await Promise.all(
        buckets.map(async (bucket) => {
          const result = (await dbAPI.items(bucket, filterParams)) || []
          const rawName = prettyBucket(bucket)
          const items = normalizeBucketItems(result, bucket, [
            rawName,
            labels[bucket]
          ])
          itemsByBucket[bucket] = items
          const openItems = items.filter((item) => !isAlertResolved(item))

          counts[rawName] = {
            total: items.length,
            open: openItems.length,
            resolved: items.length - openItems.length,
            error: openItems.filter(
              (item) => severityOf(item, ruleSeverity) === 'error'
            ).length,
            warning: openItems.filter(
              (item) => severityOf(item, ruleSeverity) === 'warning'
            ).length
          }
        })
      )

      const rank = (bucket) => {
        const count = counts[prettyBucket(bucket)] || {
          total: 0,
          error: 0,
          warning: 0
        }
        return count.error * 1e6 + count.warning * 1e3 + count.open
      }

      buckets.sort((a, b) => rank(b) - rank(a))
      const visibleBuckets = buckets.filter(
        (bucket) => counts[prettyBucket(bucket)]?.total > 0
      )

      if (requestId === bucketRequest.current) {
        setTopics(visibleBuckets)
        setBucketCounts(counts)
        setBucketItems({ query: searchQuery, items: itemsByBucket })
        setTopicLabels(labels)
        setSelectedBucket((current) =>
          visibleBuckets.includes(current) ? current : visibleBuckets[0] || null
        )
      }
    } catch (err) {
      if (requestId === bucketRequest.current) {
        context.error('Failed to load alerts')
        setTopics([])
        setBucketCounts({})
        setBucketItems({ query: searchQuery, items: {} })
        setTopicLabels({})
        setSelectedBucket(null)
      }
    } finally {
      if (requestId === bucketRequest.current) {
        setLoading(false)
        setSearching(false)
      }
    }
  }

  useEffect(() => {
    if (!searchField.trim()) {
      if (searchQuery) setSearching(true)
      setSearchQuery('')
      return
    }
    if (searchField.trim() !== searchQuery) setSearching(true)
    const timer = setTimeout(() => setSearchQuery(searchField.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchField])

  useEffect(() => {
    fetchAlertBuckets()
  }, [searchQuery])

  useEffect(() => {
    if (bucketItems.query !== searchQuery) return
    if (!selectedBucket) {
      setLogs([])
      setFieldCounts({})
      return
    }

    const result = filterAlertsByState(
      bucketItems.items[selectedBucket] || [],
      stateFilter
    ).slice(0, searchQuery ? countMax : params.num)
    setFieldCounts(countFields(result, true))
    setLogs(result)
  }, [selectedBucket, searchQuery, stateFilter, bucketItems])

  const dayLabel = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(Date.now() - 24 * 3600e3)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString()
  }

  const withDayDividers = (items) => {
    const rows = []
    let lastDay = null
    for (const item of items) {
      const day = dayLabel(item.time)
      if (day !== lastDay) {
        rows.push({ dayDivider: day })
        lastDay = day
      }
      rows.push(item)
    }
    return rows
  }

  const onChangeEvent = (event) => {
    const normalizedEvent = {
      ...event,
      State: normalizeAlertState(event.State)
    }
    const nextLogs = filterAlertsByState(
      logs.map((item) =>
        item.time === normalizedEvent.time ? normalizedEvent : item
      ),
      stateFilter
    )
    setLogs(nextLogs)
    setFieldCounts(countFields(nextLogs, true))
    setBucketItems((current) => ({
      ...current,
      items: {
        ...current.items,
        [normalizedEvent.AlertTopic]: (
          current.items[normalizedEvent.AlertTopic] || []
        ).map((item) =>
          item.time === normalizedEvent.time ? normalizedEvent : item
        )
      }
    }))
    fetchAlertBuckets()
  }

  const resolveAll = async () => {
    if (!selectedBucket) return

    const filterParams = {
      ...params,
      num: 500,
      filter: getAlertServerFilter(searchQuery)
    }
    const result = (await dbAPI.items(selectedBucket, filterParams)) || []
    const items = normalizeBucketItems(result, selectedBucket, [
      prettyBucket(selectedBucket),
      topicLabels[selectedBucket]
    ])
    const unresolved = items.filter((item) => !isAlertResolved(item))
    if (!unresolved.length) return

    await Promise.all(
      unresolved.map((event) =>
        dbAPI.putItem(selectedBucket, `timekey:${event.time}`, {
          ...event,
          State: 'Resolved'
        })
      )
    )

    context.success(`Resolved ${unresolved.length} alerts`)
    fetchAlertBuckets()
  }

  const handleBarClick = (label) => {
    const parts = label.split(':', 2)
    if (parts.length === 2) {
      const query = `Event.${parts[0]}=="${label.substring(parts[0].length + 1)}"`
      setSearchField(query)
      setSearchQuery(query)
      setSearching(query !== searchQuery)
    }
  }

  const handleSearchSubmit = (value) => {
    const nextQuery = String(value || '').trim()
    setSearchField(value)
    setSearchQuery(nextQuery)
    setSearching(nextQuery !== searchQuery)
  }

  const totals = Object.values(bucketCounts).reduce(
    (summary, count) => ({
      total: summary.total + count.open,
      error: summary.error + count.error,
      warning: summary.warning + count.warning
    }),
    { total: 0, error: 0, warning: 0 }
  )
  const selectedRawName = selectedBucket ? prettyBucket(selectedBucket) : ''
  const selectedName = selectedBucket
    ? topicLabels[selectedBucket] || selectedRawName
    : ''
  const selectedCount = logs.length
  const selectedResolvedCount = bucketCounts[selectedRawName]?.resolved || 0
  const hasChart = Object.keys(fieldCounts).length > 0
  const hasUnresolved = logs.some((item) => !isAlertResolved(item))
  const stateChoices = ['New', 'Resolved', 'All']

  const SummaryCard = ({ label, value }) => {
    return (
      <VStack
        flex={1}
        minWidth={140}
        p="$4"
        borderWidth={1}
        borderColor="$borderColorCardLight"
        borderRadius="$lg"
        bg="$backgroundCardLight"
        space="xs"
        sx={{
          _dark: {
            bg: '$backgroundCardDark',
            borderColor: '$borderColorCardDark'
          }
        }}
      >
        <Text
          size="xs"
          color="$textLight500"
          fontWeight="$medium"
          sx={{ _dark: { color: '$textDark400' } }}
        >
          {label}
        </Text>
        <Heading size="lg">{value}</Heading>
      </VStack>
    )
  }

  const CountPill = ({ action, value }) => (
    <Badge
      action={action}
      borderRadius="$full"
      variant={action === 'muted' ? 'outline' : 'solid'}
      size="sm"
    >
      <BadgeText>{value >= countMax ? `${countMax - 1}+` : value}</BadgeText>
    </Badge>
  )

  return (
    <View flex={1} bg="$backgroundContentLight" sx={{ _dark: { bg: '$backgroundContentDark' } }}>
      <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 32 }}>
        <VStack px="$4" py="$5" space="lg" maxWidth={1440} w="$full" alignSelf="center">
          <VStack space="xs">
            <HStack alignItems="center" justifyContent="space-between" space="md">
              <VStack flex={1} space="xs">
                <Heading size="lg">Alerts</Heading>
                <Text
                  size="sm"
                  color="$textLight500"
                  sx={{ _dark: { color: '$textDark400' } }}
                >
                  Review network events and clear the items that need attention.
                </Text>
              </VStack>
              <Button
                action="primary"
                variant="solid"
                size="sm"
                onPress={() => navigate('/admin/alerts/new')}
              >
                <ButtonIcon as={PlusIcon} mr="$2" />
                <ButtonText>Create alert rule</ButtonText>
              </Button>
            </HStack>
          </VStack>

          <HStack space="md" flexWrap="wrap">
            <SummaryCard label="Open alerts" value={totals.total} />
            <SummaryCard label="Critical" value={totals.error} />
            <SummaryCard label="Warnings" value={totals.warning} />
            <SummaryCard label="Sources" value={topics.length} />
          </HStack>

          <VStack
            borderWidth={1}
            borderColor="$borderColorCardLight"
            borderRadius="$lg"
            bg="$backgroundCardLight"
            overflow="hidden"
            sx={{
              _dark: {
                bg: '$backgroundCardDark',
                borderColor: '$borderColorCardDark'
              }
            }}
          >
            <VStack
              p="$3"
              space="sm"
              borderBottomWidth={1}
              borderColor="$borderColorCardLight"
              sx={{
                '@md': {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                },
                _dark: { borderColor: '$borderColorCardDark' }
              }}
            >
              <FilterInputSelect
                NoFilterCommon={true}
                topic={selectedBucket}
                value={searchField}
                items={logs}
                onChangeText={setSearchField}
                onSubmitEditing={handleSearchSubmit}
                placeholder="Search alerts, IPs, MACs, devices…"
                isLoading={searching}
                flex={1}
                maxWidth={420}
              />
              <HStack space="sm" alignItems="center" flexWrap="wrap">
                <HStack
                  borderRadius="$md"
                  borderWidth={1}
                  borderColor="$borderColorCardLight"
                  p="$0.5"
                  sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
                >
                  {stateChoices.map((choice) => (
                    <Button
                      key={choice}
                      size="xs"
                      variant={stateFilter === choice ? 'solid' : 'link'}
                      action={stateFilter === choice ? 'primary' : 'secondary'}
                      onPress={() => setStateFilter(choice)}
                      px="$3"
                    >
                      <ButtonText>{choice}</ButtonText>
                    </Button>
                  ))}
                </HStack>
                <Button
                  action="secondary"
                  variant="outline"
                  size="sm"
                  onPress={resolveAll}
                  isDisabled={!selectedBucket || !hasUnresolved}
                >
                  <ButtonIcon as={CheckIcon} mr="$2" />
                  <ButtonText>Resolve all</ButtonText>
                </Button>
              </HStack>
            </VStack>

            {loading ? (
              <VStack py="$16" alignItems="center" space="sm">
                <Icon as={BellIcon} size="xl" color="$muted400" />
                <Text
                  size="sm"
                  color="$textLight500"
                  sx={{ _dark: { color: '$textDark400' } }}
                >
                  Loading alerts…
                </Text>
              </VStack>
            ) : topics.length === 0 ? (
              <VStack py="$16" px="$6" alignItems="center" space="md">
                <View
                  w={48}
                  h={48}
                  borderRadius="$full"
                  bg="$success100"
                  alignItems="center"
                  justifyContent="center"
                  sx={{ _dark: { bg: '$success900' } }}
                >
                  <Icon as={InboxIcon} size="xl" color="$success600" />
                </View>
                <VStack alignItems="center" space="xs">
                    <Heading size="sm">
                      {searchQuery ? 'No results' : 'All clear'}
                    </Heading>
                  <Text
                    size="sm"
                    color="$textLight500"
                    textAlign="center"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    {searchQuery
                      ? `No alerts match “${searchQuery}”.`
                      : `No ${stateFilter.toLowerCase()} alerts match the current filter.`}
                  </Text>
                </VStack>
              </VStack>
            ) : (
              <View flex={1} sx={{ '@md': { flexDirection: 'row' } }}>
                <VStack
                  w="$full"
                  sx={{ '@md': { width: 280 } }}
                  borderRightWidth={0}
                  borderColor="$borderColorCardLight"
                  py="$2"
                >
                  <Text
                    size="xs"
                    color="$textLight500"
                    fontWeight="$semibold"
                    px="$4"
                    py="$2"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    ALERT SOURCES
                  </Text>
                  {topics.map((bucket) => {
                    const rawName = prettyBucket(bucket)
                    const name = topicLabels[bucket] || rawName
                    const counts = bucketCounts[rawName]
                    const rest = counts.open - counts.error - counts.warning
                    const selected = selectedBucket === bucket
                    return (
                      <Pressable key={bucket} onPress={() => setSelectedBucket(bucket)}>
                        <HStack
                          mx="$2"
                          px="$3"
                          py="$3"
                          borderRadius="$md"
                          alignItems="center"
                          space="sm"
                          bg={selected ? '$primary100' : 'transparent'}
                          borderLeftWidth={2}
                          borderLeftColor={selected ? '$primary400' : 'transparent'}
                          sx={{
                            _dark: {
                              bg: selected ? '$primary800' : 'transparent'
                            }
                          }}
                        >
                          <Icon
                            as={counts.error > 0 ? AlertTriangleIcon : BellIcon}
                            size="sm"
                            color={counts.error > 0 ? '$error500' : '$muted500'}
                          />
                          <Text flex={1} size="sm" fontWeight={selected ? '$semibold' : '$normal'}>
                            {name}
                          </Text>
                          <HStack space="xs">
                            {counts.error > 0 && (
                              <CountPill action="error" value={counts.error} />
                            )}
                            {counts.warning > 0 && (
                              <CountPill action="warning" value={counts.warning} />
                            )}
                            {rest > 0 && <CountPill action="muted" value={rest} />}
                          </HStack>
                          <Icon as={ChevronRightIcon} size="xs" color="$muted400" />
                        </HStack>
                      </Pressable>
                    )
                  })}
                </VStack>

                <VStack
                  flex={1}
                  minWidth={0}
                  borderTopWidth={1}
                  borderColor="$borderColorCardLight"
                  sx={{
                    '@md': { borderTopWidth: 0, borderLeftWidth: 1 },
                    _dark: { borderColor: '$borderColorCardDark' }
                  }}
                >
                  <HStack px="$4" py="$3" alignItems="center" justifyContent="space-between">
                    <VStack space="xs">
                      <Heading size="sm">{selectedName}</Heading>
                      <Text
                        size="xs"
                        color="$textLight500"
                        sx={{ _dark: { color: '$textDark400' } }}
                      >
                        {selectedCount}{' '}
                        {stateFilter === 'New'
                          ? selectedCount === 1
                            ? 'open event'
                            : 'open events'
                          : stateFilter === 'Resolved'
                            ? selectedCount === 1
                              ? 'resolved event'
                              : 'resolved events'
                            : selectedCount === 1
                              ? 'event'
                              : 'events'}
                      </Text>
                    </VStack>
                  </HStack>

                  {hasChart && (
                    <VStack
                      mx="$4"
                      mb="$4"
                      p="$4"
                      borderWidth={1}
                      borderColor="$borderColorCardLight"
                      borderRadius="$md"
                      space="sm"
                      sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
                    >
                      <Text
                        size="xs"
                        color="$textLight500"
                        fontWeight="$semibold"
                        sx={{ _dark: { color: '$textDark400' } }}
                      >
                        TOP SIGNALS
                      </Text>
                      <AlertChart fieldCounts={fieldCounts} onBarClick={handleBarClick} />
                    </VStack>
                  )}

                  <VStack px="$4" pb="$6">
                    {logs.length === 0 ? (
                      <VStack py="$12" alignItems="center" space="sm">
                        <Icon as={InboxIcon} size="xl" color="$muted400" />
                        <Heading size="xs">
                          {stateFilter === 'New'
                            ? 'No open alerts from this source'
                            : stateFilter === 'Resolved'
                              ? 'No resolved alerts from this source'
                              : 'No alerts from this source'}
                        </Heading>
                        {stateFilter === 'New' && selectedResolvedCount > 0 && (
                          <Text
                            size="xs"
                            color="$textLight500"
                            textAlign="center"
                            sx={{ _dark: { color: '$textDark400' } }}
                          >
                            {selectedResolvedCount}{' '}
                            {selectedResolvedCount === 1
                              ? 'resolved event is'
                              : 'resolved events are'}{' '}
                            available under Resolved.
                          </Text>
                        )}
                      </VStack>
                    ) : withDayDividers(logs).map((item, index) =>
                      item.dayDivider ? (
                        <HStack
                          key={`${item.dayDivider}-${index}`}
                          px="$4"
                          py="$2"
                          alignItems="center"
                          space="sm"
                        >
                          <Text
                            size="xs"
                            fontWeight="$semibold"
                            color="$textLight500"
                            sx={{ _dark: { color: '$textDark400' } }}
                          >
                            {item.dayDivider.toUpperCase()}
                          </Text>
                          <View
                            flex={1}
                            h={1}
                            bg="$borderColorCardLight"
                            sx={{ _dark: { bg: '$borderColorCardDark' } }}
                          />
                        </HStack>
                      ) : (
                        <AlertListItem
                          key={`${item.time}-${index}`}
                          item={item}
                          notifyChange={onChangeEvent}
                        />
                      )
                    )}
                  </VStack>
                </VStack>
              </View>
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </View>
  )
}

export default Alerts
