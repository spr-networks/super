import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
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
  Text,
  TrashIcon,
  VStack
} from '@gluestack-ui/themed'
import { PlusIcon, RefreshCwIcon } from 'lucide-react-native'

import { AlertContext } from 'layouts/Admin'
import { allowlistAPI } from 'api'
import { timeAgo } from 'utils'

const RuleBadges = ({ values, empty, onRemove }) => (
  <HStack space="sm" flexWrap="wrap">
    {(values || []).map((value) => (
      <Pressable key={value} onPress={() => onRemove(value)}>
        <Badge action="info" variant="outline" size="md" my="$0.5">
          <BadgeText textTransform="none">{value} ✕</BadgeText>
        </Badge>
      </Pressable>
    ))}
    {!values?.length ? (
      <Text size="xs" color="$muted500">
        {empty}
      </Text>
    ) : null}
  </HStack>
)

const AllowlistEditor = ({ item, status, onChange, onDelete }) => {
  const context = useContext(AlertContext)
  const [cidr, setCIDR] = useState('')
  const [domain, setDomain] = useState('')
  const [asnQuery, setAsnQuery] = useState('')
  const [asnSuggestions, setAsnSuggestions] = useState([])
  const debounceRef = useRef(null)

  const addValue = (field, rawValue, clear) => {
    const value = rawValue.trim()
    if (!value) return
    if ((item[field] || []).includes(value)) {
      return context.error(`${value} is already in ${item.Name}`)
    }
    onChange({ ...item, [field]: [...(item[field] || []), value] })
    clear('')
  }

  const removeValue = (field, value) =>
    onChange({
      ...item,
      [field]: (item[field] || []).filter((entry) => entry !== value)
    })

  const onASNQuery = (value) => {
    setAsnQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setAsnSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => {
      allowlistAPI
        .asnSearch(value.trim())
        .then((result) =>
          setAsnSuggestions(Array.isArray(result) ? result : [])
        )
        .catch(() => setAsnSuggestions([]))
    }, 300)
  }

  const addASN = (entry) => {
    if ((item.ASNs || []).some((current) => current.ASN === entry.ASN)) {
      return context.error(`AS${entry.ASN} is already in ${item.Name}`)
    }
    onChange({ ...item, ASNs: [...(item.ASNs || []), entry] })
    setAsnQuery('')
    setAsnSuggestions([])
  }

  const errors = (status?.Sources || []).filter((source) => source.Error)

  return (
    <VStack
      space="md"
      p="$4"
      borderRadius={10}
      bg="$backgroundCardLight"
      sx={{ _dark: { bg: '$backgroundCardDark' } }}
    >
      <HStack alignItems="center" justifyContent="space-between" space="md">
        <VStack flex={1}>
          <Text size="md" bold>
            {item.Name}
          </Text>
          <Text size="xs" color="$muted500">
            Policy: Whitelist · {item.Name}
          </Text>
        </VStack>
        <Badge action="muted" variant="solid">
          <BadgeText>
            {(status?.RangesProgrammed || 0).toLocaleString()} ranges
          </BadgeText>
        </Badge>
        <Button size="sm" action="negative" variant="link" onPress={onDelete}>
          <ButtonIcon
            as={TrashIcon}
            color="$red700"
            size={Platform.OS === 'web' ? 'lg' : 'md'}
          />
        </Button>
      </HStack>

      <VStack space="xs">
        <Text size="sm" bold>
          IPs and CIDRs
        </Text>
        <RuleBadges
          values={item.CIDRs}
          empty="No IP ranges allowed"
          onRemove={(value) => removeValue('CIDRs', value)}
        />
        <HStack space="sm" sx={{ '@md': { maxWidth: 520 } }}>
          <Input flex={1} size="sm">
            <InputField
              value={cidr}
              placeholder="203.0.113.10 or 203.0.113.0/24"
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={setCIDR}
              onSubmitEditing={() => addValue('CIDRs', cidr, setCIDR)}
            />
          </Input>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!cidr.trim()}
            onPress={() => addValue('CIDRs', cidr, setCIDR)}
          >
            <ButtonIcon as={PlusIcon} />
          </Button>
        </HStack>
      </VStack>

      <VStack space="xs">
        <Text size="sm" bold>
          Domains
        </Text>
        <RuleBadges
          values={item.Domains}
          empty="No domains allowed"
          onRemove={(value) => removeValue('Domains', value)}
        />
        <HStack space="sm" sx={{ '@md': { maxWidth: 520 } }}>
          <Input flex={1} size="sm">
            <InputField
              value={domain}
              placeholder="api.example.com or *.updates.example.com"
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={setDomain}
              onSubmitEditing={() => addValue('Domains', domain, setDomain)}
            />
          </Input>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!domain.trim()}
            onPress={() => addValue('Domains', domain, setDomain)}
          >
            <ButtonIcon as={PlusIcon} />
          </Button>
        </HStack>
      </VStack>

      <VStack space="xs">
        <Text size="sm" bold>
          ASNs
        </Text>
        <VStack space="xs">
          {(item.ASNs || []).map((asn) => (
            <HStack key={asn.ASN} alignItems="center" space="md">
              <Text size="sm" bold w={90}>
                AS{asn.ASN}
              </Text>
              <Text size="sm" flex={1} isTruncated>
                {asn.Name}
              </Text>
              <Button
                size="sm"
                action="negative"
                variant="link"
                onPress={() =>
                  onChange({
                    ...item,
                    ASNs: item.ASNs.filter((entry) => entry.ASN !== asn.ASN)
                  })
                }
              >
                <ButtonIcon as={TrashIcon} color="$red700" />
              </Button>
            </HStack>
          ))}
          {!item.ASNs?.length ? (
            <Text size="xs" color="$muted500">
              No ASNs allowed
            </Text>
          ) : null}
        </VStack>
        <VStack space="xs" sx={{ '@md': { maxWidth: 520 } }}>
          <Input size="sm">
            <InputField
              value={asnQuery}
              placeholder="Search by provider name or AS number"
              autoCorrect={false}
              onChangeText={onASNQuery}
            />
          </Input>
          {asnSuggestions.map((asn) => (
            <Pressable key={asn.ASN} onPress={() => addASN(asn)}>
              <HStack p="$2" alignItems="center" space="md">
                <Text size="sm" bold w={90}>
                  AS{asn.ASN}
                </Text>
                <Text size="sm" flex={1} isTruncated>
                  {asn.Name}
                </Text>
                <Icon as={PlusIcon} size="sm" color="$muted500" />
              </HStack>
            </Pressable>
          ))}
        </VStack>
      </VStack>

      {errors.map((source) => (
        <Text key={`${source.Type}:${source.Key}`} size="xs" color="$red600">
          {source.Key}: {source.Error}
        </Text>
      ))}
    </VStack>
  )
}

const AllowlistPane = () => {
  const context = useContext(AlertContext)
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState(null)
  const [newName, setNewName] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = () => {
    allowlistAPI
      .config()
      .then(setConfig)
      .catch(() => setConfig(null))
    allowlistAPI
      .status()
      .then(setStatus)
      .catch(() => setStatus(null))
  }

  useEffect(load, [])

  const save = (next) =>
    allowlistAPI
      .setConfig(next)
      .then((saved) => {
        setConfig(saved)
        context.success('Whitelist policies saved')
        allowlistAPI
          .status()
          .then(setStatus)
          .catch(() => {})
      })
      .catch((error) => context.error('API Failure: ' + error.message))

  const createAllowlist = () => {
    const Name = newName.trim().toLowerCase()
    if (!Name.match(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/)) {
      return context.error('Use 1-32 lowercase letters, numbers, or hyphens')
    }
    if (config.Allowlists.some((item) => item.Name === Name)) {
      return context.error(`Whitelist ${Name} already exists`)
    }
    save({
      ...config,
      Allowlists: [
        ...(config.Allowlists || []),
        { Name, CIDRs: [], ASNs: [], Domains: [] }
      ]
    })
    setNewName('')
  }

  const refresh = () => {
    setRefreshing(true)
    allowlistAPI
      .refresh()
      .then((result) => {
        setStatus(result)
        setRefreshing(false)
        context.success('Whitelist destinations refreshed')
      })
      .catch((error) => {
        setRefreshing(false)
        context.error('API Failure: ' + error.message)
      })
  }

  if (!config) {
    return (
      <Text p="$4" size="sm" color="$muted500">
        Whitelist configuration is not available
      </Text>
    )
  }

  return (
    <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 96 }}>
      <VStack space="md" p="$4">
        <VStack
          space="sm"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <HStack alignItems="center" justifyContent="space-between" space="md">
            <VStack flex={1}>
              <Text size="sm" bold>
                Whitelists
              </Text>
              <Text size="xs" color="$muted500">
                Allow only selected destinations for assigned devices and
                containers.
              </Text>
            </VStack>
            <Button
              size="sm"
              action="secondary"
              variant="outline"
              isDisabled={refreshing}
              onPress={refresh}
            >
              {refreshing ? (
                <Spinner size="small" />
              ) : (
                <ButtonIcon as={RefreshCwIcon} mr="$1" />
              )}
              <ButtonText>Refresh</ButtonText>
            </Button>
          </HStack>
          {status?.LastRefresh ? (
            <Text size="xs" color="$muted500">
              Last refreshed {timeAgo(status.LastRefresh)}
            </Text>
          ) : null}
        </VStack>

        {(config.Allowlists || []).map((item) => (
          <AllowlistEditor
            key={item.Name}
            item={item}
            status={(status?.Allowlists || []).find(
              (entry) => entry.Name === item.Name
            )}
            onChange={(updated) =>
              save({
                ...config,
                Allowlists: config.Allowlists.map((entry) =>
                  entry.Name === item.Name ? updated : entry
                )
              })
            }
            onDelete={() =>
              save({
                ...config,
                Allowlists: config.Allowlists.filter(
                  (entry) => entry.Name !== item.Name
                )
              })
            }
          />
        ))}

        <VStack
          space="sm"
          p="$4"
          borderRadius={10}
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <Text size="sm" bold>
            Create whitelist
          </Text>
          <HStack space="sm" sx={{ '@md': { maxWidth: 520 } }}>
            <Input flex={1} size="sm">
              <InputField
                value={newName}
                placeholder="work-services"
                autoCorrect={false}
                autoCapitalize="none"
                onChangeText={setNewName}
                onSubmitEditing={createAllowlist}
              />
            </Input>
            <Button
              size="sm"
              isDisabled={!newName.trim()}
              onPress={createAllowlist}
            >
              <ButtonIcon as={PlusIcon} mr="$1" />
              <ButtonText>Create</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </ScrollView>
  )
}

export default AllowlistPane
