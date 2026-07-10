import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  VStack,
  Switch,
  Text,
  Icon,
  Link,
  LinkText,
  Pressable,
  CloseIcon,
  Spinner,
  Divider
} from '@gluestack-ui/themed'
import {
  MonitorCheckIcon,
  EditIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  ExternalLinkIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from 'lucide-react-native'

import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import ModalForm from 'components/ModalForm'
import EditPlugin from 'components/Plugins/EditPlugin'

import { pluginAPI, api } from 'api'
import { alertState } from 'AppContext'

const NO_POLICY = 'no attestation policy for this image'

const AttestResultView = ({ result, showImage }) => {
  const noPolicy = !result.Verified && result.Error === NO_POLICY

  return (
    <VStack space="sm">
      {showImage ? (
        <Text size="xs" bold>
          {result.Image}
        </Text>
      ) : null}

      <Badge
        action={result.Verified ? 'success' : noPolicy ? 'muted' : 'error'}
        variant="outline"
        size="sm"
        alignSelf="flex-start"
      >
        <Icon
          as={result.Verified ? ShieldCheckIcon : ShieldXIcon}
          size="xs"
          mr="$1"
          color={
            result.Verified
              ? '$success700'
              : noPolicy
                ? '$muted500'
                : '$error700'
          }
        />
        <BadgeText>
          {result.Verified
            ? 'Verified build (cosign)'
            : noPolicy
              ? 'Not attested (third-party image)'
              : 'Unverified'}
        </BadgeText>
      </Badge>

      {result.Digest ? (
        <VStack space="xs">
          <Text size="xs" color="$muted500">
            Build hash
          </Text>
          <Text size="xs" color="$muted500">
            {result.Digest}
          </Text>
        </VStack>
      ) : null}

      {result.Signer ? (
        <VStack space="xs">
          <Text size="xs" color="$muted500">
            Signed by
          </Text>
          <Text size="xs" color="$muted500">
            {result.Signer}
          </Text>
          {result.Issuer ? (
            <Text size="xs" color="$muted500">
              {result.Issuer}
            </Text>
          ) : null}
        </VStack>
      ) : null}

      {!result.Verified && result.Error && !noPolicy ? (
        <Text size="xs" color="$error600">
          {result.Error}
        </Text>
      ) : null}

      {result.RekorURL ? (
        <Link isExternal href={result.RekorURL}>
          <HStack space="xs" alignItems="center">
            <LinkText size="sm">
              Verify in Sigstore
              {result.LogIndex ? ` (Rekor #${result.LogIndex})` : ''}
            </LinkText>
            <Icon as={ExternalLinkIcon} color="$muted500" size="xs" />
          </HStack>
        </Link>
      ) : null}
    </VStack>
  )
}

const BUILTIN_SERVICE_OVERRIDE = {
  'dns-block-extension': 'dns',
  'dns-log-extension': 'dns'
}

const attestQueryFor = (item) => {
  const compose = item.ComposeFilePath || ''
  const service = compose
    ? ''
    : BUILTIN_SERVICE_OVERRIDE[item.Name] || (item.Name || '').toLowerCase()
  if (!compose && !service) {
    return null
  }
  const params = new URLSearchParams()
  if (compose) params.set('compose_file', compose)
  if (service) params.set('service', service)
  return { key: compose || 'service:' + service, query: params.toString() }
}

const PluginListItem = ({
  item,
  deleteListItem,
  handleChange,
  handleRestart,
  notifyChange,
  attestEntry,
  ensureAttest,
  refreshAttest,
  ...props
}) => {
  const navigate = useNavigate()
  const editModalRef = useRef(null)
  const [attestExpanded, setAttestExpanded] = useState(false)

  const attestQuery = attestQueryFor(item)

  const onToggleAttest = () => {
    const next = !attestExpanded
    setAttestExpanded(next)
    if (next && attestQuery) ensureAttest(attestQuery)
  }

  const getFieldDisplay = (label, value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null

    return (
      <HStack space="sm" w="$full">
        <Text size="sm" color="$muted500" minWidth={120}>
          {label}:
        </Text>
        <Text size="sm" flex={1} numberOfLines={1}>
          {Array.isArray(value) ? value.join(', ') : value}
        </Text>
      </HStack>
    )
  }

  const renderAttestBody = () => {
    if (!attestQuery) {
      return (
        <Text size="sm" color="$muted500">
          This plugin has no compose file or service to attest.
        </Text>
      )
    }
    if (!attestEntry || attestEntry.loading) {
      return (
        <HStack space="sm" alignItems="center">
          <Spinner size="small" />
          <Text size="sm" color="$muted500">
            Checking provenance…
          </Text>
        </HStack>
      )
    }
    if (attestEntry.error) {
      return (
        <VStack space="xs">
          <Text size="sm" color="$error600">
            {attestEntry.error}
          </Text>
          <Button
            size="xs"
            variant="outline"
            action="secondary"
            alignSelf="flex-start"
            onPress={() => refreshAttest(attestQuery)}
          >
            <ButtonText>Retry</ButtonText>
          </Button>
        </VStack>
      )
    }
    const results = attestEntry.results || []
    if (results.length === 0) {
      return (
        <VStack space="xs">
          <Text size="sm" color="$muted500">
            No images found for this plugin.
          </Text>
          <Button
            size="xs"
            variant="outline"
            action="secondary"
            alignSelf="flex-start"
            onPress={() => refreshAttest(attestQuery)}
          >
            <ButtonText>Re-check</ButtonText>
          </Button>
        </VStack>
      )
    }
    return (
      <VStack space="md">
        {results.map((r, i) => (
          <AttestResultView
            key={r.Image || i}
            result={r}
            showImage={results.length > 1}
          />
        ))}
        <Button
          size="xs"
          variant="outline"
          action="secondary"
          alignSelf="flex-start"
          onPress={() => refreshAttest(attestQuery)}
        >
          <ButtonText>Re-check</ButtonText>
        </Button>
      </VStack>
    )
  }

  return (
    <ListItem>
      <VStack flex={1} space="md">
        <HStack space="md" alignItems="center">
          <Text size="lg" bold>
            {item.Name}
          </Text>

          {item.Version === undefined ? (
            <Spinner size="small" />
          ) : (
            <Badge
              variant="outline"
              action={item.Version ? 'success' : 'muted'}
              alignSelf="center"
            >
              <BadgeText>{item.Version || 'none'}</BadgeText>
            </Badge>
          )}
        </HStack>

        <VStack space="xs">
          {getFieldDisplay('URI', item.URI)}
          {getFieldDisplay('Git URL', item.GitURL)}
          {getFieldDisplay('Unix Path', item.UnixPath)}
          {getFieldDisplay('Compose Path', item.ComposeFilePath)}
          {getFieldDisplay('Token Path', item.InstallTokenPath)}
          {getFieldDisplay('Scoped Paths', item.ScopedPaths)}
        </VStack>

        <HStack space="sm" alignItems="center">
          {item.HasUI && (
            <Badge variant="solid" action="info">
              <BadgeText>Has UI</BadgeText>
            </Badge>
          )}

          {item.Plus && (
            <Badge variant="solid" action="warning">
              <BadgeText>PLUS</BadgeText>
            </Badge>
          )}
        </HStack>

        <Divider />

        <Pressable onPress={onToggleAttest}>
          <HStack space="sm" alignItems="center">
            <Icon
              as={attestExpanded ? ChevronDownIcon : ChevronRightIcon}
              size="sm"
              color="$muted500"
            />
            <Text size="sm" color="$muted500">
              Build attestation
            </Text>
          </HStack>
        </Pressable>

        {attestExpanded ? <Box pl="$6">{renderAttestBody()}</Box> : null}
      </VStack>

      <HStack space="md" alignItems="center">
        <Box w={80} alignItems="center">
          <Switch
            value={item.Enabled}
            onValueChange={() => handleChange(item, !item.Enabled)}
          />
        </Box>

        {item.Enabled && item.ComposeFilePath ? (
          <Tooltip label={'Restart plugin'}>
            <Button
              variant="solid"
              action="secondary"
              size="sm"
              onPress={() => handleRestart(item)}
            >
              <ButtonIcon as={RotateCwIcon} />
            </Button>
          </Tooltip>
        ) : null}

        {item.Enabled && item.HasUI && (
          <Tooltip label={'Show plugin UI'}>
            <Button
              variant="link"
              action="secondary"
              size="sm"
              onPress={() =>
                navigate(
                  `/admin/custom_plugin/${encodeURIComponent(item.URI)}/`
                )
              }
            >
              <ButtonIcon as={MonitorCheckIcon} />
            </Button>
          </Tooltip>
        )}

        <ModalForm
          title={`Edit Plugin: ${item.Name}`}
          triggerComponent={
            <Button variant="solid" action="secondary" size="sm">
              <ButtonIcon as={EditIcon} />
            </Button>
          }
          modalRef={editModalRef}
        >
          <EditPlugin
            plugin={item}
            onClose={() => editModalRef.current?.()}
            notifyChange={notifyChange}
          />
        </ModalForm>

        <Button
          variant="link"
          onPress={() => deleteListItem(item)}
        >
          <ButtonIcon as={CloseIcon} color="$red700" />
        </Button>
      </HStack>
    </ListItem>
  )
}

const PluginList = ({ list, deleteListItem, notifyChange, ...props }) => {
  const [attestByKey, setAttestByKey] = useState({})

  const setEntry = (key, patch) =>
    setAttestByKey((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch }
    }))

  const loadPluginAttest = (attestQuery) => {
    if (!attestQuery) return
    const { key, query } = attestQuery
    setEntry(key, { loading: true, error: null })
    return api
      .get('/pluginAttest?' + query)
      .then((results) => {
        setEntry(key, {
          loading: false,
          error: null,
          results: results || []
        })
      })
      .catch((err) => {
        setEntry(key, {
          loading: false,
          error:
            'Failed to query build attestation: ' + (err?.message || err)
        })
      })
  }

  const ensureAttest = (attestQuery) => {
    const entry = attestByKey[attestQuery.key]
    if (entry && (entry.loading || entry.results || entry.error)) return
    loadPluginAttest(attestQuery)
  }

  const refreshAttest = (attestQuery) => loadPluginAttest(attestQuery)

  const handleChange = (plugin, Enabled) => {
    plugin.Enabled = Enabled

    pluginAPI
      .update(plugin)
      .then((plugins) => {
        notifyChange(plugins)
      })
      .catch((err) => {
        alertState.error('Failed to update plugin state: ' + err.message)
      })

    if (plugin.Plus == true) {
      if (Enabled == false) {
        pluginAPI.stopPlusExtension(plugin.Name)
      } else {
        pluginAPI.startPlusExtension(plugin.Name)
      }
    }
  }

  const handleRestart = (plugin) => {
    pluginAPI
      .restart(plugin.Name)
      .then(() => {
        alertState.success(`Restarted plugin: ${plugin.Name}`)
      })
      .catch((err) => {
        alertState.error('Failed to restart plugin: ' + err.message)
      })
  }

  const renderItem = ({ item }) => (
    <PluginListItem
      item={item}
      deleteListItem={deleteListItem}
      handleChange={handleChange}
      handleRestart={handleRestart}
      notifyChange={notifyChange}
      attestEntry={attestByKey[attestQueryFor(item)?.key]}
      ensureAttest={ensureAttest}
      refreshAttest={refreshAttest}
    />
  )

  return (
    <FlatList
      data={list}
      estimatedItemSize={100}
      renderItem={renderItem}
      keyExtractor={(item) => JSON.stringify(item)}
    />
  )
}

export default PluginList
