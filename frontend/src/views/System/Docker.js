import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  Heading,
  HStack,
  Icon,
  Menu,
  MenuItem,
  MenuItemLabel,
  FlatList,
  Text,
  VStack,
  ThreeDotsIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon,
  Pressable,
  Link,
  LinkText,
  Spinner
} from '@gluestack-ui/themed'

import {
  HardDriveIcon,
  ListIcon,
  CableIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  ExternalLinkIcon
} from 'lucide-react-native'

import { ListHeader, ListItem } from 'components/List'

import { api } from 'api'
import { AlertContext, ModalContext } from 'AppContext'

const niceName = (name) => {
  if (Array.isArray(name)) {
    name = name[0]
  }

  return name.replace(/^\//, '')
}

const stateColor = (state) => {
  let stateColors = {
    running: 'success',
    exited: 'warning'
  }
  return stateColors[state] || 'muted'
}

// drop the :tag and @sha256 so a running container's image matches the
// attestation result keyed by repo tag
const normalizeRepo = (img) => (img || '').split('@')[0].replace(/:[^/]+$/, '')

const DockerInfo = ({ ...props }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  const [containers, setContainers] = useState([])
  const [attestByImage, setAttestByImage] = useState({})

  const loadAttest = (method = 'get') => {
    const req =
      method === 'put' ? api.put('/attestStatus') : api.get('/attestStatus')
    return req.then((results) => {
      const list = results || []
      let m = {}
      list.forEach((r) => {
        m[normalizeRepo(r.Image)] = r
      })
      setAttestByImage(m)
      return list.length
    })
  }

  const signatureDetails = (attest) => (
    <VStack space="md">
      <VStack space="xs">
        <Heading size="xs">Image digest</Heading>
        <Text size="xs" color="$muted500">
          {attest.Digest}
        </Text>
      </VStack>
      {attest.Signer ? (
        <VStack space="xs">
          <Heading size="xs">Signed by</Heading>
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
      {attest.Config ? (
        <VStack space="xs">
          <Heading size="xs">Config layer</Heading>
          <Text size="xs" color="$muted500">
            {attest.Config}
          </Text>
        </VStack>
      ) : null}
      {attest.Layers?.length ? (
        <VStack space="xs">
          <Heading size="xs">Container layers ({attest.Layers.length})</Heading>
          {attest.Layers.map((l, i) => (
            <Text key={i} size="xs" color="$muted500">
              {l}
            </Text>
          ))}
        </VStack>
      ) : null}
      {attest.Error ? (
        <VStack space="xs">
          <Heading size="xs">Error</Heading>
          <Text size="xs" color="$error600">
            {attest.Error}
          </Text>
        </VStack>
      ) : null}
      {attest.RekorURL ? (
        <Link isExternal href={attest.RekorURL}>
          <HStack space="xs" alignItems="center">
            <LinkText size="sm">
              Verify in Sigstore{attest.LogIndex ? ` (Rekor #${attest.LogIndex})` : ''}
            </LinkText>
            <Icon as={ExternalLinkIcon} color="$muted500" size="xs" />
          </HStack>
        </Link>
      ) : null}
    </VStack>
  )

  const signatureBadge = (item) => {
    let attest = attestByImage[normalizeRepo(item.Image)]
    if (!attest) {
      return null
    }
    let verified = attest.Verified
    return (
      <Pressable
        onPress={() =>
          modalContext.modal(
            `${niceName(item.Names)} signature`,
            signatureDetails(attest)
          )
        }
      >
        <Badge
          action={verified ? 'success' : 'error'}
          variant="outline"
          size="sm"
        >
          <Icon
            as={verified ? ShieldCheckIcon : ShieldXIcon}
            size="xs"
            mr="$1"
            color={verified ? '$success700' : '$error700'}
          />
          <BadgeText>{verified ? 'verified' : 'unverified'}</BadgeText>
        </Badge>
      </Pressable>
    )
  }

  const renderDockerContainer = ({ item, navigate }) => {
    let containerName = niceName(item.Names)

    const onMounts = () => {
      modalContext.modal(
        `${containerName} Volume Mounts`,
        <FlatList
          data={item.Mounts}
          keyExtractor={(item) => item.Source}
          renderItem={({ item: mount }) => (
            <HStack space="sm" p="$4" justifyContent="space-around">
              {/*<Text>{mount.Type}</Text>*/}
              <Text size="xs">{mount.Source}</Text>
              <Text size="xs" color="$muted500">
                {mount.Destination}
              </Text>
              <Badge size="sm" ml="auto" action="muted" variant="outline">
                <BadgeText>{mount.Mode}</BadgeText>
              </Badge>
            </HStack>
          )}
        />
      )
    }

    const onLogs = () => {
      navigate(`/admin/logs/${containerName}`)
    }

    const getNetworkMode = (item) => {
      let modes =
        item.NetworkSettings &&
        item.NetworkSettings.Networks &&
        Object.keys(item.NetworkSettings.Networks)

      let networkMode =
        modes && modes.length == 1 ? modes[0] : 'multiple/unknown'

      return networkMode
    }

    const onNetwork = () => {
      let networkMode = getNetworkMode(item)
      let ipAddress =
        networkMode == 'host'
          ? 'host'
          : item.NetworkSettings.Networks.bridge.IPAddress
      modalContext.modal(
        `${containerName} Network`,
        <VStack>
          <VStack space="md">
            <Heading size="sm">IPAddress</Heading>
            <Text>{ipAddress}</Text>
          </VStack>
          {item.Ports && item.Ports.length ? (
            <VStack space="md">
              <Heading size="sm" my="$2">
                Ports
              </Heading>
              {item.Ports.map((pmap, idx) => (
                <HStack key={`pmap-${idx}`} space="md" maxW={400}>
                  <HStack
                    space="md"
                    w={'200'}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Badge variant="outline">{pmap.Type}</Badge>
                    <Text flex={1}>
                      {pmap.IP}:{pmap.PublicPort}
                    </Text>
                    <ArrowRightIcon color="$muted500" />
                    <Text flex={1} justifyContent="flex-end">
                      {ipAddress}:{pmap.PrivatePort}
                    </Text>
                  </HStack>
                </HStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      )
    }

    const trigger = (triggerProps) => (
      <Button variant="link" ml="auto" {...triggerProps}>
        <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
      </Button>
    )

    const moreMenu = (
      <Menu
        flex={1}
        trigger={trigger}
        selectionMode="single"
        onSelectionChange={(e) => {
          let value = e.currentKey
          if (value == 'logs') {
            onLogs()
          } else if (value == 'mounts') {
            onMounts()
          } else if (value == 'network') {
            onNetwork()
          }

          if (Platform.OS == 'web' && window !== undefined) {
            window.scrollTo(0, 0)
          }
        }}
      >
        <MenuItem key="logs">
          <Icon as={ListIcon} color="$muted500" mr="$2" />
          <MenuItemLabel size="sm">Logs</MenuItemLabel>
        </MenuItem>
        <MenuItem key="mounts">
          <Icon as={HardDriveIcon} color="$muted500" mr="$2" />
          <MenuItemLabel size="sm">Mounts</MenuItemLabel>
        </MenuItem>
        <MenuItem key="network" isDisabled={item.State != 'running'}>
          <Icon as={CableIcon} color="$muted500" mr="$2" />
          <MenuItemLabel size="sm">Network</MenuItemLabel>
        </MenuItem>
      </Menu>
    )

    const networkSummary = (item) => {
      //<pre>{JSON.stringify(item.Ports)}</pre>
      let networkMode = getNetworkMode(item)
      return (
        <Badge action="muted" variant={'outline'} size="sm">
          <BadgeText>{networkMode}</BadgeText>
        </Badge>
      )
    }

    return (
      <ListItem>
        <VStack flex={1} space="md">
          <Text size="sm">{containerName}</Text>
          <HStack space="md" alignItems="center">
            <Badge action={stateColor(item.State)} variant="outline" size="sm">
              <BadgeText>{item.State}</BadgeText>
            </Badge>
            {networkSummary(item)}
            {signatureBadge(item)}
          </HStack>
        </VStack>

        <Text flex={1} size="xs" color="$muted500" isTruncated>
          {item.Image}
        </Text>

        <VStack
          flex={1}
          sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
        >
          <Text minW="200" textAlign="right" size="xs" color="$muted500">
            {item.Status}
          </Text>
        </VStack>

        {moreMenu}
      </ListItem>
    )
  }

  useEffect(() => {
    api
      .get('/info/docker')
      .then((containers) => {
        // prio running containers, newest first
        containers.sort(
          (a, b) =>
            (b.State == 'running' ? 100 : 1) * b.Created -
            (a.State == 'running' ? 100 : 1) * a.Created
        )
        containers = containers.filter((c) => c.State.match(/running|exited/))
        setContainers(containers)
        //setContainers(containers.filter(c => c.Image.match(/spr-networks/)))
      })
      .catch((err) => context.error(err))
  }, [])

  const [verifying, setVerifying] = useState(false)

  // auto: show cached results immediately, then re-verify in the background so
  // the displayed signatures are always fresh — no user action needed
  useEffect(() => {
    loadAttest().catch(() => {})
    setVerifying(true)
    loadAttest('put')
      .catch(() => {})
      .finally(() => setVerifying(false))
  }, [])

  const [showDocker, setShowDocker] = useState(false)

  return (
    <Box {...props}>
      <ListHeader title="Docker Containers">
        {verifying ? (
          <HStack ml="auto" space="xs" alignItems="center">
            <Spinner size="small" />
            <Text size="xs" color="$muted500">
              Verifying signatures…
            </Text>
          </HStack>
        ) : null}
        <Button
          size="sm"
          action="muted"
          variant="link"
          ml={verifying ? '$2' : 'auto'}
          onPress={() => setShowDocker(!showDocker)}
        >
          <ButtonText color="$muted500">
            {showDocker ? 'Hide info' : 'Show info'}
          </ButtonText>
          <ButtonIcon as={showDocker ? EyeOffIcon : EyeIcon} ml="$1" />
        </Button>
      </ListHeader>

      <FlatList
        data={containers}
        display={showDocker ? 'flex' : 'none'}
        keyExtractor={(item, index) => item.Id}
        estimatedItemSize={100}
        renderItem={({ item }) => renderDockerContainer({ item, navigate })}
      />
    </Box>
  )
}

export default DockerInfo
