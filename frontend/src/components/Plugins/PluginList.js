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

// drop the :tag and @sha256 so a plugin's expected repo matches the
// attestation result keyed by repo tag (mirrors System/Docker.js)
const normalizeRepo = (img) => (img || '').split('@')[0].replace(/:[^/]+$/, '')

const PluginListItem = ({
  item,
  deleteListItem,
  handleChange,
  handleRestart,
  notifyChange,
  attestByImage,
  attestLoading,
  attestLoaded,
  attestError,
  ensureAttest,
  refreshAttest,
  ...props
}) => {
  const navigate = useNavigate()
  const editModalRef = useRef(null)
  const [attestExpanded, setAttestExpanded] = useState(false)

  // expected image repo basename: last path segment of the GitURL
  // (e.g. https://github.com/spr-networks/spr-tor -> spr-tor), else Name
  const expectedRepo = (() => {
    let git = (item.GitURL || '')
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
    let seg = git.split('/').pop()
    return seg || item.Name || ''
  })()

  // find the attestation whose normalized repo basename matches this plugin
  const attest = (() => {
    if (!expectedRepo) return null
    let keys = Object.keys(attestByImage || {})
    for (let k of keys) {
      if (k.split('/').pop() === expectedRepo) return attestByImage[k]
    }
    return null
  })()

  const onToggleAttest = () => {
    const next = !attestExpanded
    setAttestExpanded(next)
    // lazy: only query superd on first expand (guarded in the parent)
    if (next) ensureAttest()
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

        {attestExpanded ? (
          <Box pl="$6">
            {attestLoading ? (
              <HStack space="sm" alignItems="center">
                <Spinner size="small" />
                <Text size="sm" color="$muted500">
                  Checking provenance…
                </Text>
              </HStack>
            ) : attestError ? (
              <VStack space="xs">
                <Text size="sm" color="$error600">
                  {attestError}
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  action="secondary"
                  alignSelf="flex-start"
                  onPress={() => refreshAttest()}
                >
                  <ButtonText>Retry</ButtonText>
                </Button>
              </VStack>
            ) : attest ? (
              <VStack space="sm">
                <Badge
                  action={attest.Verified ? 'success' : 'error'}
                  variant="outline"
                  size="sm"
                  alignSelf="flex-start"
                >
                  <Icon
                    as={attest.Verified ? ShieldCheckIcon : ShieldXIcon}
                    size="xs"
                    mr="$1"
                    color={attest.Verified ? '$success700' : '$error700'}
                  />
                  <BadgeText>
                    {attest.Verified
                      ? 'Verified build (cosign)'
                      : 'Unverified'}
                  </BadgeText>
                </Badge>

                <VStack space="xs">
                  <Text size="xs" color="$muted500">
                    Build hash
                  </Text>
                  <Text size="xs" color="$muted500">
                    {attest.Digest}
                  </Text>
                </VStack>

                {attest.Signer ? (
                  <VStack space="xs">
                    <Text size="xs" color="$muted500">
                      Signed by
                    </Text>
                    <Text size="xs" color="$muted500">
                      {attest.Signer}
                    </Text>
                    {attest.Issuer ? (
                      <Text size="xs" color="$muted500">
                        {attest.Issuer}
                      </Text>
                    ) : null}
                  </VStack>
                ) : null}

                {attest.Error ? (
                  <Text size="xs" color="$error600">
                    {attest.Error}
                  </Text>
                ) : null}

                {attest.RekorURL ? (
                  <Link isExternal href={attest.RekorURL}>
                    <HStack space="xs" alignItems="center">
                      <LinkText size="sm">
                        Verify in Sigstore
                        {attest.LogIndex ? ` (Rekor #${attest.LogIndex})` : ''}
                      </LinkText>
                      <Icon as={ExternalLinkIcon} color="$muted500" size="xs" />
                    </HStack>
                  </Link>
                ) : null}
              </VStack>
            ) : (
              <VStack space="xs">
                <Text size="sm" color="$muted500">
                  No build attestation found for this image. It may be a
                  locally built or third-party image.
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  action="secondary"
                  alignSelf="flex-start"
                  onPress={() => refreshAttest()}
                >
                  <ButtonText>Re-check</ButtonText>
                </Button>
              </VStack>
            )}
          </Box>
        ) : null}
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
  // build-attestation state, keyed by normalized repo. queried lazily on the
  // first time a user expands a plugin's "Build attestation" row (not on mount)
  const [attestByImage, setAttestByImage] = useState({})
  const [attestLoaded, setAttestLoaded] = useState(false)
  const [attestLoading, setAttestLoading] = useState(false)
  const [attestError, setAttestError] = useState(null)

  const buildMap = (results) => {
    let m = {}
    ;(results || []).forEach((r) => {
      m[normalizeRepo(r.Image)] = r
    })
    return m
  }

  // get -> cached results; put -> force superd to re-verify, then use its result
  const loadAttest = (method = 'get') => {
    setAttestLoading(true)
    setAttestError(null)
    const req =
      method === 'put' ? api.put('/attestStatus') : api.get('/attestStatus')
    return req
      .then((results) => {
        setAttestByImage(buildMap(results))
        setAttestLoaded(true)
      })
      .catch((err) => {
        setAttestError(
          'Failed to query build attestation: ' + (err?.message || err)
        )
      })
      .finally(() => setAttestLoading(false))
  }

  // lazy guard: tolerate item remounts (FlatList re-keys on refresh) by keying
  // state in the parent, so a first-expand never triggers a refetch storm
  const ensureAttest = () => {
    if (attestLoaded || attestLoading) return
    loadAttest('get')
  }

  const refreshAttest = () => loadAttest('put')

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
      attestByImage={attestByImage}
      attestLoading={attestLoading}
      attestLoaded={attestLoaded}
      attestError={attestError}
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
