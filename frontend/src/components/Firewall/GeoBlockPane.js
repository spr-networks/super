import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Icon,
  Input,
  InputField,
  Pressable,
  ScrollView,
  Spinner,
  Switch,
  Text,
  VStack,
  TrashIcon
} from '@gluestack-ui/themed'

import { PlusIcon, RefreshCwIcon } from 'lucide-react-native'

import { AlertContext } from 'layouts/Admin'
import { geoBlockAPI } from 'api'
import { timeAgo } from 'utils'
import { Select } from 'components/Select'

let regionNames = null
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
} catch (e) {}

const flagEmoji = (cc) => {
  if (!cc || !cc.match(/^[A-Za-z]{2}$/)) {
    return ''
  }

  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

const countryName = (cc) => {
  if (!cc) {
    return 'Unknown'
  }

  try {
    return regionNames?.of(cc.toUpperCase()) || cc
  } catch (e) {
    return cc
  }
}

const spamhausListDefault = {
  URI: 'https://www.spamhaus.org/drop/asndrop.json',
  Enabled: false,
  Note: 'Spamhaus ASN-DROP'
}

const countryOptions = (() => {
  if (!regionNames) {
    return []
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const options = []
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b
      try {
        const name = regionNames.of(code)
        if (name && name != code) {
          options.push({ code, name })
        }
      } catch (e) {}
    }
  }
  return options
})()

const searchCountries = (query) => {
  query = query.trim().toLowerCase()
  if (query.length < 2) {
    return []
  }

  const matches = countryOptions.filter(
    ({ code, name }) =>
      code == query.toUpperCase() || name.toLowerCase().includes(query)
  )
  matches.sort((a, b) => {
    let aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1
    let bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1
    return aStarts - bStarts || a.name.localeCompare(b.name)
  })
  return matches.slice(0, 8)
}

const GeoBlockPane = () => {
  const context = useContext(AlertContext)
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const [countrySuggestions, setCountrySuggestions] = useState([])
  const [asnQuery, setAsnQuery] = useState('')
  const [asnSuggestions, setAsnSuggestions] = useState([])
  const [addListURI, setAddListURI] = useState('')
  const debounceRef = useRef(null)

  const refreshGeo = () => {
    geoBlockAPI
      .config()
      .then(setConfig)
      .catch(() => setConfig(null))
    geoBlockAPI
      .status()
      .then(setStatus)
      .catch(() => setStatus(null))
  }

  useEffect(() => {
    refreshGeo()
  }, [])

  const saveConfig = (cfg) => {
    geoBlockAPI
      .setConfig(cfg)
      .then((res) => {
        setConfig(res && res.DenyCountries !== undefined ? res : cfg)
        context.success('Geo blocking settings saved')
        geoBlockAPI
          .status()
          .then(setStatus)
          .catch(() => {})
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const refreshNow = () => {
    setRefreshing(true)
    geoBlockAPI
      .refresh()
      .then((st) => {
        setRefreshing(false)
        if (st && st.Sources !== undefined) {
          setStatus(st)
        }
        context.success('Geo blocklists refreshed')
      })
      .catch((err) => {
        setRefreshing(false)
        context.error('API Failure: ' + err.message)
      })
  }

  if (!config) {
    return (
      <Text p="$4" size="sm" color="$muted500">
        Geo blocking configuration is not available
      </Text>
    )
  }

  const removeCountry = (cc) => {
    geoBlockAPI
      .unblockCountry(cc)
      .then(() => {
        context.success(`Unblocked ${countryName(cc)}`)
        refreshGeo()
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const onChangeCountryQuery = (q) => {
    setCountryQuery(q)
    setCountrySuggestions(searchCountries(q))
  }

  const selectCountry = (cc) => {
    geoBlockAPI
      .blockCountry(cc)
      .then(() => {
        context.success(`Blocked ${countryName(cc)}`)
        setCountryQuery('')
        setCountrySuggestions([])
        refreshGeo()
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const submitCountryQuery = () => {
    if (countryQuery.match(/^[A-Za-z]{2}$/)) {
      return selectCountry(countryQuery.toUpperCase())
    }
    if (countrySuggestions.length == 1) {
      return selectCountry(countrySuggestions[0].code)
    }
    context.error('Search for a country by name or 2-letter code')
  }

  const removeAsn = (a) => {
    geoBlockAPI
      .unblockASN(a.ASN)
      .then(() => {
        context.success(`Unblocked AS${a.ASN}`)
        refreshGeo()
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const onChangeAsnQuery = (q) => {
    setAsnQuery(q)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (q.length < 2) {
      setAsnSuggestions([])
      return
    }

    debounceRef.current = setTimeout(() => {
      geoBlockAPI
        .asnSearch(q.trim())
        .then((res) => setAsnSuggestions(Array.isArray(res) ? res : []))
        .catch(() => setAsnSuggestions([]))
    }, 300)
  }

  const selectAsn = (s) => {
    geoBlockAPI
      .blockASN(s.ASN)
      .then(() => {
        context.success(`Blocked AS${s.ASN} ${s.Name}`)
        setAsnQuery('')
        setAsnSuggestions([])
        refreshGeo()
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const handleListSwitch = (item, value) => {
    let Lists = (config.Lists || []).map((l) =>
      l.URI == item.URI ? { ...l, Enabled: value } : l
    )
    saveConfig({ ...config, Lists })
  }

  const deleteList = (item) => {
    let Lists = (config.Lists || []).filter((l) => l.URI != item.URI)
    saveConfig({ ...config, Lists })
  }

  const addList = (item) => {
    if (!item.URI.match(/^https?:\/\/.+/)) {
      return context.error('Enter a valid http(s) URL')
    }

    if ((config.Lists || []).map((l) => l.URI).includes(item.URI)) {
      return context.error('List already added')
    }

    saveConfig({ ...config, Lists: [...(config.Lists || []), item] })
    setAddListURI('')
  }

  let lists = config.Lists || []
  let showRecommended = !lists.map((l) => l.URI).includes(spamhausListDefault.URI)

  return (
    <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 96 }}>
      <VStack space="md" p="$4">
        <HStack
          space="md"
          alignItems="center"
          justifyContent="space-between"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <VStack flex={1}>
            <Text size="sm" bold>
              Enable ASN / Country blocking
            </Text>
            <Text size="xs" color="$muted500">
              Blocked destinations are dropped for all devices and logged as
              drop:geo events
            </Text>
          </VStack>
          <Switch
            value={!!config.Enabled}
            onToggle={() => saveConfig({ ...config, Enabled: !config.Enabled })}
          />
        </HStack>

        <VStack
          space="md"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <Text size="sm" bold>
            Blocked Countries
          </Text>

          <HStack space="sm" flexWrap="wrap">
            {(config.DenyCountries || []).map((cc) => (
              <Pressable key={cc} onPress={() => removeCountry(cc)}>
                <Badge action="error" variant="outline" size="md" my="$0.5">
                  <BadgeText textTransform="none">
                    {flagEmoji(cc)} {countryName(cc)} ✕
                  </BadgeText>
                </Badge>
              </Pressable>
            ))}
            {!config.DenyCountries?.length ? (
              <Text size="xs" color="$muted500">
                No countries blocked
              </Text>
            ) : null}
          </HStack>

          <VStack space="xs" sx={{ '@md': { maxWidth: 480 } }}>
            <Input size="sm">
              <InputField
                value={countryQuery}
                placeholder="Add country: search by name or 2-letter code"
                autoCorrect={false}
                onChangeText={onChangeCountryQuery}
                onSubmitEditing={submitCountryQuery}
              />
            </Input>
            {countrySuggestions.map(({ code, name }) => (
              <Pressable key={code} onPress={() => selectCountry(code)}>
                <HStack
                  p="$2"
                  space="md"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor="$muted200"
                  sx={{ _dark: { borderColor: '$muted600' } }}
                >
                  <Text size="lg" w="$8" textAlign="center">
                    {flagEmoji(code)}
                  </Text>
                  <Text flex={1} size="sm" isTruncated>
                    {name}
                  </Text>
                  <Text size="xs" color="$muted500">
                    {code}
                  </Text>
                  <Icon as={PlusIcon} size="sm" color="$muted500" />
                </HStack>
              </Pressable>
            ))}
          </VStack>
        </VStack>

        <VStack
          space="md"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <Text size="sm" bold>
            Blocked ASNs
          </Text>

          <VStack space="xs">
            {(config.DenyASNs || []).map((a) => (
              <HStack key={a.ASN} space="md" alignItems="center">
                <Text size="sm" bold w={90}>
                  AS{a.ASN}
                </Text>
                <Text flex={1} size="sm" isTruncated>
                  {a.Name}
                </Text>
                <Button
                  size="sm"
                  action="negative"
                  variant="link"
                  onPress={() => removeAsn(a)}
                >
                  <ButtonIcon
                    as={TrashIcon}
                    color="$red700"
                    size={Platform.OS == 'web' ? 'lg' : 'md'}
                  />
                </Button>
              </HStack>
            ))}
            {!config.DenyASNs?.length ? (
              <Text size="xs" color="$muted500">
                No ASNs blocked
              </Text>
            ) : null}
          </VStack>

          <VStack space="xs" sx={{ '@md': { maxWidth: 480 } }}>
            <Input size="sm">
              <InputField
                value={asnQuery}
                placeholder="Add ASN: search by name or AS number"
                autoCorrect={false}
                onChangeText={onChangeAsnQuery}
              />
            </Input>
            {asnSuggestions.map((s) => (
              <Pressable key={s.ASN} onPress={() => selectAsn(s)}>
                <HStack
                  p="$2"
                  space="md"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor="$muted200"
                  sx={{ _dark: { borderColor: '$muted600' } }}
                >
                  <Text size="sm" bold w={90}>
                    AS{s.ASN}
                  </Text>
                  <Text flex={1} size="sm" isTruncated>
                    {s.Name}
                  </Text>
                  <Text size="xs" color="$muted500">
                    {s.RangeCount?.toLocaleString()} ranges
                  </Text>
                  <Icon as={PlusIcon} size="sm" color="$muted500" />
                </HStack>
              </Pressable>
            ))}
          </VStack>
        </VStack>

        <VStack
          space="md"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <Text size="sm" bold>
            Public Blocklists
          </Text>

          <VStack space="sm">
            {lists.map((item) => (
              <HStack key={item.URI} space="md" alignItems="center">
                <Switch
                  size="sm"
                  value={!!item.Enabled}
                  onToggle={() => handleListSwitch(item, !item.Enabled)}
                />
                <VStack flex={1}>
                  <Text size="sm" bold isTruncated>
                    {item.Note || item.URI.split('/').pop()}
                  </Text>
                  <Text size="xs" color="$muted500" isTruncated>
                    {item.URI}
                  </Text>
                </VStack>
                <Button
                  size="sm"
                  action="negative"
                  variant="link"
                  onPress={() => deleteList(item)}
                >
                  <ButtonIcon
                    as={TrashIcon}
                    color="$red700"
                    size={Platform.OS == 'web' ? 'lg' : 'md'}
                  />
                </Button>
              </HStack>
            ))}

            {showRecommended ? (
              <HStack space="md" alignItems="center" opacity={0.75}>
                <VStack flex={1}>
                  <Text size="sm" bold>
                    {spamhausListDefault.Note}
                  </Text>
                  <Text size="xs" color="$muted500" isTruncated>
                    {spamhausListDefault.URI}
                  </Text>
                </VStack>
                <Button
                  size="xs"
                  action="primary"
                  variant="outline"
                  onPress={() =>
                    addList({ ...spamhausListDefault, Enabled: true })
                  }
                >
                  <ButtonIcon as={PlusIcon} mr="$1" />
                  <ButtonText>Add</ButtonText>
                </Button>
              </HStack>
            ) : null}
          </VStack>

          <HStack space="sm" alignItems="center" sx={{ '@md': { maxWidth: 480 } }}>
            <Input flex={1} size="sm">
              <InputField
                value={addListURI}
                placeholder="https://example.com/asn-blocklist.json"
                autoCorrect={false}
                autoCapitalize="none"
                onChangeText={setAddListURI}
                onSubmitEditing={() =>
                  addList({ URI: addListURI.trim(), Enabled: true, Note: '' })
                }
              />
            </Input>
            <Button
              size="sm"
              action="primary"
              isDisabled={!addListURI.trim().length}
              onPress={() =>
                addList({ URI: addListURI.trim(), Enabled: true, Note: '' })
              }
            >
              <ButtonIcon as={PlusIcon} mr="$1" />
              <ButtonText>Add</ButtonText>
            </Button>
          </HStack>

          <HStack space="md" alignItems="center">
            <Box flex={1} maxWidth={220}>
              <Select
                selectedValue={config.RefreshSeconds == 604800 ? '604800' : '86400'}
                initialLabel={
                  config.RefreshSeconds == 604800
                    ? 'Refresh Weekly'
                    : 'Refresh Daily'
                }
                placeholder="Refresh interval"
                onValueChange={(v) =>
                  saveConfig({ ...config, RefreshSeconds: parseInt(v) })
                }
              >
                <Select.Item label="Refresh Daily" value="86400" />
                <Select.Item label="Refresh Weekly" value="604800" />
              </Select>
            </Box>
            <Button
              size="sm"
              action="secondary"
              variant="outline"
              isDisabled={refreshing}
              onPress={refreshNow}
            >
              {refreshing ? (
                <Spinner size="small" mr="$1" />
              ) : (
                <ButtonIcon as={RefreshCwIcon} mr="$1" />
              )}
              <ButtonText>Refresh now</ButtonText>
            </Button>
          </HStack>
        </VStack>

        <VStack
          space="md"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <HStack space="md" alignItems="center" justifyContent="space-between">
            <Text size="sm" bold>
              Status
            </Text>
            <Badge
              action={status?.Enabled ? 'success' : 'muted'}
              variant="outline"
              size="sm"
            >
              <BadgeText>{status?.Enabled ? 'Active' : 'Inactive'}</BadgeText>
            </Badge>
          </HStack>

          {status ? (
            <VStack space="sm">
              <HStack space="md">
                <Text size="xs" color="$muted500">
                  {(status.RangesProgrammed || 0).toLocaleString()} ranges
                  programmed
                </Text>
                <Text size="xs" color="$muted500">
                  Last refresh: {timeAgo(status.LastRefresh) || 'never'}
                </Text>
              </HStack>

              {(status.Sources || []).map((s) => (
                <HStack
                  key={`${s.Type}:${s.Key}`}
                  space="md"
                  alignItems="center"
                >
                  <Badge action="muted" variant="outline" size="sm" w={80}>
                    <BadgeText>{s.Type}</BadgeText>
                  </Badge>
                  <Text flex={1} size="xs" isTruncated>
                    {s.Type == 'country'
                      ? `${flagEmoji(s.Key)} ${countryName(s.Key)}`
                      : s.Key}
                  </Text>
                  <Text size="xs" color="$muted500">
                    {(s.Ranges || 0).toLocaleString()} ranges
                    {s.ASNs ? `, ${s.ASNs} ASNs` : ''}
                  </Text>
                  {s.LastFetch ? (
                    <Text size="xs" color="$muted500">
                      {timeAgo(s.LastFetch)}
                    </Text>
                  ) : null}
                  {s.Error ? (
                    <Text size="xs" color="$red500" isTruncated>
                      {s.Error}
                    </Text>
                  ) : null}
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text size="xs" color="$muted500">
              No status available
            </Text>
          )}
        </VStack>
      </VStack>
    </ScrollView>
  )
}

export default GeoBlockPane
