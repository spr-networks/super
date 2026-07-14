import React, { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonGroup,
  ButtonIcon,
  ButtonText,
  FlatList,
  Heading,
  HStack,
  Icon,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pressable,
  Spinner,
  Text,
  View,
  VStack,
  CloseIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@gluestack-ui/themed'

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BanIcon,
  ChevronRightIcon,
  ContainerIcon,
  GlobeIcon,
  RefreshCwIcon
} from 'lucide-react-native'

import { AlertContext } from 'layouts/Admin'
import { deviceAPI, geoBlockAPI, trafficInsightsAPI } from 'api'
import { getContainerIpMap, containerDevice } from 'api/Containers'
import { prettySize, timeAgo } from 'utils'
import DeviceItem from 'components/Devices/DeviceItem'
import { ListHeader } from 'components/List'

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

const deviceFallback = (ip) => ({
  Name: ip,
  Style: { Icon: 'Ethernet', Color: '$blueGray500' }
})

const ipToLong = (ip) => {
  let parts = (ip || '').split('.').map(Number)
  if (parts.length != 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return null
  }
  return (
    (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>>
    0
  )
}

const ipInCidrs = (ip, cidrs) => {
  let addr = ipToLong(ip)
  if (addr == null) {
    return false
  }

  for (let cidr of cidrs || []) {
    let [base, bits] = cidr.split('/')
    let baseAddr = ipToLong(base)
    let prefix = parseInt(bits)
    if (baseAddr == null || isNaN(prefix) || prefix < 0 || prefix > 32) {
      continue
    }
    let mask = prefix == 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    if (((addr & mask) >>> 0) == ((baseAddr & mask) >>> 0)) {
      return true
    }
  }

  return false
}

const ContainerItem = ({ ip, device }) => (
  <HStack space="md" alignItems="center">
    <Icon as={ContainerIcon} color="$blueGray500" />
    <VStack>
      <Text size="sm" bold>
        {device?.Name || ip}
      </Text>
      {device?.Name ? (
        <Text size="xs" color="$muted500">
          {ip}
        </Text>
      ) : null}
    </VStack>
  </HStack>
)

const BytesCell = ({ BytesIn, BytesOut }) => (
  <VStack alignItems="flex-end" w={90}>
    <HStack space="xs" alignItems="center">
      <Icon size="xs" as={ArrowDownIcon} color="$muted500" />
      <Text size="xs">{prettySize(BytesIn || 0)}</Text>
    </HStack>
    <HStack space="xs" alignItems="center">
      <Icon size="xs" as={ArrowUpIcon} color="$muted500" />
      <Text size="xs">{prettySize(BytesOut || 0)}</Text>
    </HStack>
  </VStack>
)

const ShareBar = ({ pct }) => (
  <Box
    h={3}
    w="100%"
    bg="$muted200"
    borderRadius={2}
    sx={{ _dark: { bg: '$muted700' } }}
  >
    <Box
      h={3}
      borderRadius={2}
      bg="$primary400"
      w={`${Math.max(Math.min(pct, 100), 0.5)}%`}
    />
  </Box>
)

const ConfirmModal = ({
  isOpen,
  title,
  message,
  actionLabel,
  onConfirm,
  onClose
}) => (
  <Modal isOpen={isOpen} onClose={onClose} useRNModal={Platform.OS == 'web'}>
    <ModalBackdrop />
    <ModalContent>
      <ModalHeader>
        <Heading size="sm">{title}</Heading>
        <ModalCloseButton>
          <Icon as={CloseIcon} />
        </ModalCloseButton>
      </ModalHeader>
      <ModalBody>
        <Text size="sm">{message}</Text>
      </ModalBody>
      <ModalFooter>
        <Button
          size="sm"
          action="secondary"
          variant="outline"
          mr="$3"
          onPress={onClose}
        >
          <ButtonText>Cancel</ButtonText>
        </Button>
        <Button size="sm" action="negative" onPress={onConfirm}>
          <ButtonText>{actionLabel || 'Confirm'}</ButtonText>
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
)

const DeviceBytesRow = ({ item, devicesByIp, navigate }) => (
  <HStack space="sm" alignItems="center">
    <Pressable
      flex={1}
      onPress={() => navigate(`/admin/traffic_insights/${item.IP}`)}
    >
      <DeviceItem
        size="sm"
        item={devicesByIp[item.IP] || deviceFallback(item.IP)}
        noPress
      />
    </Pressable>
    <BytesCell BytesIn={item.BytesIn} BytesOut={item.BytesOut} />
  </HStack>
)

const CountryRow = ({
  item,
  devicesByIp,
  isBlocked,
  onBlockToggle,
  navigate
}) => {
  const [expanded, setExpanded] = useState(false)
  let cc = item.Country

  return (
    <VStack
      borderBottomWidth={1}
      borderColor="$muted200"
      sx={{ _dark: { borderColor: '$muted600' } }}
    >
      <HStack px="$4" py="$3" space="md" alignItems="center">
        <Pressable flex={1} onPress={() => setExpanded(!expanded)}>
          <HStack space="md" alignItems="center">
            {cc ? (
              <Text size="xl">{flagEmoji(cc)}</Text>
            ) : (
              <Icon as={GlobeIcon} color="$muted400" size="lg" />
            )}
            <VStack flex={1}>
              <HStack space="sm" alignItems="center">
                <Text size="sm" bold isTruncated>
                  {countryName(cc)}
                </Text>
                {isBlocked ? (
                  <Badge action="error" variant="solid" size="sm">
                    <BadgeText>Blocked</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
              <Text size="xs" color="$muted500">
                {cc ? `${cc} · ` : ''}
                {item.Devices?.length || 0}{' '}
                {item.Devices?.length == 1 ? 'device' : 'devices'}
              </Text>
            </VStack>
          </HStack>
        </Pressable>

        <BytesCell BytesIn={item.BytesIn} BytesOut={item.BytesOut} />

        <Box
          w={110}
          alignItems="flex-end"
          display="none"
          sx={{ '@md': { display: 'flex' } }}
        >
          {cc ? (
            <Button
              size="xs"
              action="secondary"
              variant="outline"
              onPress={() => onBlockToggle(item)}
            >
              <ButtonIcon as={BanIcon} mr="$1" />
              <ButtonText>{isBlocked ? 'Unblock' : 'Block'}</ButtonText>
            </Button>
          ) : null}
        </Box>

        <Pressable onPress={() => setExpanded(!expanded)}>
          <Icon
            as={expanded ? ChevronUpIcon : ChevronDownIcon}
            color="$muted500"
          />
        </Pressable>
      </HStack>

      <Box px="$4" pb="$2">
        <ShareBar pct={item.SharePct} />
      </Box>

      {expanded ? (
        <VStack px="$4" pb="$4" space="md">
          {cc ? (
            <Button
              size="xs"
              action="secondary"
              variant="outline"
              alignSelf="flex-start"
              sx={{ '@md': { display: 'none' } }}
              onPress={() => onBlockToggle(item)}
            >
              <ButtonIcon as={BanIcon} mr="$1" />
              <ButtonText>{isBlocked ? 'Unblock' : 'Block'}</ButtonText>
            </Button>
          ) : null}

          <VStack space="sm">
            <Text size="xs" bold color="$muted500">
              Devices
            </Text>
            {(item.Devices || []).map((d) => (
              <DeviceBytesRow
                key={d.IP}
                item={d}
                devicesByIp={devicesByIp}
                navigate={navigate}
              />
            ))}
          </VStack>

          {item.ASNs?.length ? (
            <VStack space="sm">
              <Text size="xs" bold color="$muted500">
                Top ASNs
              </Text>
              {item.ASNs.slice(0, 5).map((a) => (
                <HStack key={a.ASN} space="sm" alignItems="center">
                  <Text size="xs" color="$muted500" w={80}>
                    AS{a.ASN}
                  </Text>
                  <Text flex={1} size="sm" isTruncated>
                    {a.Name}
                  </Text>
                  <BytesCell BytesIn={a.BytesIn} BytesOut={a.BytesOut} />
                </HStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  )
}

const AsnRow = ({ item, devicesByIp, isBlocked, onBlockToggle, navigate }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <VStack
      borderBottomWidth={1}
      borderColor="$muted200"
      sx={{ _dark: { borderColor: '$muted600' } }}
    >
      <HStack px="$4" py="$3" space="md" alignItems="center">
        <Pressable flex={1} onPress={() => setExpanded(!expanded)}>
          <HStack space="md" alignItems="center">
            <Text size="xl">{flagEmoji(item.Country) || ' '}</Text>
            <VStack flex={1}>
              <HStack space="sm" alignItems="center">
                <Text size="sm" bold isTruncated>
                  {item.Name || `AS${item.ASN}`}
                </Text>
                {isBlocked ? (
                  <Badge action="error" variant="solid" size="sm">
                    <BadgeText>Blocked</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
              <Text size="xs" color="$muted500">
                AS{item.ASN} · {item.Devices?.length || 0}{' '}
                {item.Devices?.length == 1 ? 'device' : 'devices'}
              </Text>
            </VStack>
          </HStack>
        </Pressable>

        <BytesCell BytesIn={item.BytesIn} BytesOut={item.BytesOut} />

        <Box
          w={110}
          alignItems="flex-end"
          display="none"
          sx={{ '@md': { display: 'flex' } }}
        >
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            onPress={() => onBlockToggle(item)}
          >
            <ButtonIcon as={BanIcon} mr="$1" />
            <ButtonText>{isBlocked ? 'Unblock' : 'Block'}</ButtonText>
          </Button>
        </Box>

        <Pressable onPress={() => setExpanded(!expanded)}>
          <Icon
            as={expanded ? ChevronUpIcon : ChevronDownIcon}
            color="$muted500"
          />
        </Pressable>
      </HStack>

      <Box px="$4" pb="$2">
        <ShareBar pct={item.SharePct} />
      </Box>

      {expanded ? (
        <VStack px="$4" pb="$4" space="md">
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            alignSelf="flex-start"
            sx={{ '@md': { display: 'none' } }}
            onPress={() => onBlockToggle(item)}
          >
            <ButtonIcon as={BanIcon} mr="$1" />
            <ButtonText>{isBlocked ? 'Unblock' : 'Block'}</ButtonText>
          </Button>

          <VStack space="sm">
            <Text size="xs" bold color="$muted500">
              Devices
            </Text>
            {(item.Devices || []).map((d) => (
              <DeviceBytesRow
                key={d.IP}
                item={d}
                devicesByIp={devicesByIp}
                navigate={navigate}
              />
            ))}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  )
}

const DeviceDetail = ({ ip, minutes, devicesByIp, navigate }) => {
  const context = useContext(AlertContext)
  const [data, setData] = useState(null)

  const fetchData = () => {
    trafficInsightsAPI
      .device(ip, minutes)
      .then(setData)
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  useEffect(() => {
    fetchData()
  }, [ip, minutes])

  let total = (data?.BytesIn || 0) + (data?.BytesOut || 0)
  let dests = data?.Destinations || []

  return (
    <VStack flex={1}>
      <HStack
        p="$4"
        space="md"
        alignItems="center"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
      >
        <Button
          size="sm"
          action="secondary"
          variant="link"
          onPress={() => navigate('/admin/traffic_insights')}
        >
          <ButtonIcon as={ArrowLeftIcon} mr="$1" />
          <ButtonText>Back</ButtonText>
        </Button>

        <Box flex={1}>
          <DeviceItem item={devicesByIp[ip] || deviceFallback(ip)} noPress />
        </Box>

        <BytesCell BytesIn={data?.BytesIn} BytesOut={data?.BytesOut} />
      </HStack>

      {data == null ? (
        <Spinner m="$4" alignSelf="flex-start" />
      ) : (
        <FlatList
          data={dests}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListHeaderComponent={
            <ListHeader
              title="Destinations"
              description={`${dests.length} ${
                dests.length == 1 ? 'destination' : 'destinations'
              } in the selected window`}
            />
          }
          ListEmptyComponent={
            <Text p="$4" size="sm" color="$muted500">
              No traffic recorded for this device in the selected window
            </Text>
          }
          renderItem={({ item }) => {
            let bytes = (item.BytesIn || 0) + (item.BytesOut || 0)
            let pct = total ? (bytes / total) * 100 : 0

            return (
              <VStack
                px="$4"
                py="$3"
                space="sm"
                bg="$backgroundCardLight"
                borderBottomWidth={1}
                borderColor="$muted200"
                sx={{
                  _dark: {
                    bg: '$backgroundCardDark',
                    borderColor: '$muted600'
                  }
                }}
              >
                <HStack space="md" alignItems="center">
                  <VStack flex={1}>
                    <Text size="sm" bold isTruncated>
                      {item.Domain || item.IP}
                    </Text>
                    <Text size="xs" color="$muted500" isTruncated>
                      {[
                        item.Domain ? item.IP : null,
                        item.ASNName || (item.ASN ? `AS${item.ASN}` : null)
                      ]
                        .filter((x) => x)
                        .join(' · ')}
                    </Text>
                  </VStack>

                  <Text size="lg">{flagEmoji(item.Country)}</Text>

                  <BytesCell BytesIn={item.BytesIn} BytesOut={item.BytesOut} />

                  <Text size="xs" color="$muted500" w={70} textAlign="right">
                    {timeAgo(item.LastSeen)}
                  </Text>
                </HStack>
                <ShareBar pct={pct} />
              </VStack>
            )
          }}
          keyExtractor={(item) => `${item.IP}:${item.Domain}`}
        />
      )}
    </VStack>
  )
}

const timeRanges = [
  { label: 'Last hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 }
]

const tabs = ['Countries', 'ASNs', 'Devices', 'Containers']

const TrafficInsights = (props) => {
  const context = useContext(AlertContext)
  const params = useParams()
  const navigate = useNavigate()

  const [minutes, setMinutes] = useState(1440)
  const [tab, setTab] = useState('Countries')
  const [overview, setOverview] = useState(null)
  const [geoConfig, setGeoConfig] = useState(null)
  const [devicesByIp, setDevicesByIp] = useState({})
  const [pendingBlock, setPendingBlock] = useState(null)

  let detailIp = params.ip && params.ip != ':ip' ? params.ip : null

  const fetchOverview = () => {
    trafficInsightsAPI
      .overview(minutes)
      .then(setOverview)
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const fetchDevices = () => {
    Promise.all([
      deviceAPI.list().catch(() => ({})),
      getContainerIpMap()
    ]).then(([devs, containers]) => {
      let byIp = {}
      Object.values(devs || {}).map((d) => {
        if (d.RecentIP) {
          byIp[d.RecentIP] = d
        }
      })
      Object.entries(containers || {}).map(([ip, entry]) => {
        if (!byIp[ip]) {
          byIp[ip] = containerDevice(ip, entry)
        }
      })
      setDevicesByIp(byIp)
    })
  }

  const refreshGeo = () => {
    geoBlockAPI
      .config()
      .then(setGeoConfig)
      .catch(() => setGeoConfig(null))
  }

  useEffect(() => {
    fetchDevices()
    refreshGeo()
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [minutes, tab])

  const refreshAll = () => {
    fetchOverview()
    fetchDevices()
    refreshGeo()
  }

  const confirmBlockToggle = () => {
    let p = pendingBlock
    if (!p) {
      return
    }

    setPendingBlock(null)

    let call =
      p.type == 'country'
        ? p.blocked
          ? geoBlockAPI.unblockCountry(p.key)
          : geoBlockAPI.blockCountry(p.key)
        : p.blocked
          ? geoBlockAPI.unblockASN(p.key)
          : geoBlockAPI.blockASN(p.key)

    call
      .then(() => {
        context.success(`${p.blocked ? 'Unblocked' : 'Blocked'} ${p.name}`)
        if (!p.blocked && !geoConfig?.Enabled) {
          context.info(
            'Geo blocking is disabled - rule saved but not enforced until enabled under Firewall > ASN/Geo Block'
          )
        }
        refreshGeo()
      })
      .catch((err) => context.error('API Failure: ' + err.message))
  }

  const onBlockToggleCountry = (item) => {
    setPendingBlock({
      type: 'country',
      key: item.Country,
      name: countryName(item.Country),
      blocked: geoConfig?.DenyCountries?.includes(item.Country)
    })
  }

  const onBlockToggleAsn = (item) => {
    setPendingBlock({
      type: 'asn',
      key: item.ASN,
      name: item.Name || `AS${item.ASN}`,
      blocked: geoConfig?.DenyASNs?.map((a) => a.ASN).includes(item.ASN)
    })
  }

  const deviceTotals = () => {
    let totals = {}
    for (let c of overview?.Countries || []) {
      for (let d of c.Devices || []) {
        if (!totals[d.IP]) {
          totals[d.IP] = { IP: d.IP, BytesIn: 0, BytesOut: 0 }
        }
        totals[d.IP].BytesIn += d.BytesIn || 0
        totals[d.IP].BytesOut += d.BytesOut || 0
      }
    }

    return Object.values(totals).sort(
      (a, b) => b.BytesIn + b.BytesOut - (a.BytesIn + a.BytesOut)
    )
  }

  const renderTab = () => {
    if (overview == null) {
      return <Spinner m="$4" alignSelf="flex-start" />
    }

    let total = (overview.TotalIn || 0) + (overview.TotalOut || 0)
    const withShare = (items) =>
      (items || []).map((item) => ({
        ...item,
        SharePct: total
          ? (((item.BytesIn || 0) + (item.BytesOut || 0)) / total) * 100
          : 0
      }))

    if (tab == 'Countries') {
      return (
        <FlatList
          data={withShare(overview.Countries)}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListEmptyComponent={
            <Text p="$4" size="sm" color="$muted500">
              No traffic recorded in the selected window
            </Text>
          }
          renderItem={({ item }) => (
            <CountryRow
              item={item}
              devicesByIp={devicesByIp}
              isBlocked={geoConfig?.DenyCountries?.includes(item.Country)}
              onBlockToggle={onBlockToggleCountry}
              navigate={navigate}
            />
          )}
          keyExtractor={(item) => item.Country || 'unknown'}
        />
      )
    }

    if (tab == 'ASNs') {
      return (
        <FlatList
          data={withShare(overview.ASNs)}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListEmptyComponent={
            <Text p="$4" size="sm" color="$muted500">
              No traffic recorded in the selected window
            </Text>
          }
          renderItem={({ item }) => (
            <AsnRow
              item={item}
              devicesByIp={devicesByIp}
              isBlocked={geoConfig?.DenyASNs?.map((a) => a.ASN).includes(
                item.ASN
              )}
              onBlockToggle={onBlockToggleAsn}
              navigate={navigate}
            />
          )}
          keyExtractor={(item) => `${item.ASN}`}
        />
      )
    }

    let isContainerTab = tab == 'Containers'
    let containerNets = overview.ContainerNets || []
    let deviceList = deviceTotals().filter(
      (d) => ipInCidrs(d.IP, containerNets) == isContainerTab
    )

    return (
      <FlatList
        data={withShare(deviceList)}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListEmptyComponent={
          <Text p="$4" size="sm" color="$muted500">
            {isContainerTab
              ? 'No container traffic recorded in the selected window'
              : 'No traffic recorded in the selected window'}
          </Text>
        }
        renderItem={({ item }) => (
          <VStack
            bg="$backgroundCardLight"
            borderBottomWidth={1}
            borderColor="$muted200"
            sx={{
              _dark: { bg: '$backgroundCardDark', borderColor: '$muted600' }
            }}
          >
            <HStack px="$4" py="$3" space="md" alignItems="center">
              <Pressable
                flex={1}
                onPress={() => navigate(`/admin/traffic_insights/${item.IP}`)}
              >
                {isContainerTab ? (
                  <ContainerItem ip={item.IP} device={devicesByIp[item.IP]} />
                ) : (
                  <DeviceItem
                    size="sm"
                    item={devicesByIp[item.IP] || deviceFallback(item.IP)}
                    noPress
                  />
                )}
              </Pressable>
              <BytesCell BytesIn={item.BytesIn} BytesOut={item.BytesOut} />
              <Pressable
                onPress={() => navigate(`/admin/traffic_insights/${item.IP}`)}
              >
                <Icon as={ChevronRightIcon} color="$muted500" />
              </Pressable>
            </HStack>
            <Box px="$4" pb="$2">
              <ShareBar pct={item.SharePct} />
            </Box>
          </VStack>
        )}
        keyExtractor={(item) => item.IP}
      />
    )
  }

  return (
    <View h="100%" sx={{ '@md': { height: '92vh' } }}>
      <VStack
        bg="$backgroundCardLight"
        p="$4"
        space="md"
        borderBottomWidth={1}
        borderColor="$muted200"
        sx={{
          _dark: { bg: '$backgroundCardDark', borderColor: '$muted600' }
        }}
      >
        <HStack
          space="md"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
        >
          {!detailIp ? (
            <ButtonGroup size="xs" space="sm" flexWrap="wrap">
              {tabs.map((t) => (
                <Button
                  key={t}
                  action="secondary"
                  variant={tab == t ? 'solid' : 'outline'}
                  onPress={() => setTab(t)}
                >
                  <ButtonText>{t}</ButtonText>
                </Button>
              ))}
            </ButtonGroup>
          ) : (
            <Heading size="sm">
              {ipInCidrs(detailIp, overview?.ContainerNets)
                ? 'Container Traffic'
                : 'Device Traffic'}
            </Heading>
          )}

          <HStack space="md" alignItems="center" marginLeft="auto">
            {overview ? (
              <HStack space="md" alignItems="center" mr="$2">
                <HStack space="xs" alignItems="center">
                  <Icon size="xs" as={ArrowDownIcon} color="$muted500" />
                  <Text size="sm" color="$muted500">
                    {prettySize(overview.TotalIn || 0)}
                  </Text>
                </HStack>
                <HStack space="xs" alignItems="center">
                  <Icon size="xs" as={ArrowUpIcon} color="$muted500" />
                  <Text size="sm" color="$muted500">
                    {prettySize(overview.TotalOut || 0)}
                  </Text>
                </HStack>
              </HStack>
            ) : null}
            <Button
              size="xs"
              action="secondary"
              variant="outline"
              onPress={() =>
                navigate('/admin/firewall?tab=' + encodeURIComponent('ASN/Geo Block'))
              }
            >
              <ButtonIcon as={BanIcon} mr="$1" />
              <ButtonText>Blocking</ButtonText>
            </Button>
            <Button
              size="sm"
              action="secondary"
              variant="link"
              onPress={refreshAll}
            >
              <ButtonIcon as={RefreshCwIcon} />
            </Button>
          </HStack>
        </HStack>

        <ButtonGroup size="xs" space="sm" flexWrap="wrap">
          {timeRanges.map((r) => (
            <Button
              key={r.minutes}
              action="primary"
              variant={minutes == r.minutes ? 'solid' : 'outline'}
              onPress={() => setMinutes(r.minutes)}
            >
              <ButtonText>{r.label}</ButtonText>
            </Button>
          ))}
        </ButtonGroup>
      </VStack>

      {detailIp ? (
        <DeviceDetail
          ip={detailIp}
          minutes={minutes}
          devicesByIp={devicesByIp}
          navigate={navigate}
        />
      ) : (
        renderTab()
      )}

      <ConfirmModal
        isOpen={pendingBlock != null}
        title={`${pendingBlock?.blocked ? 'Unblock' : 'Block'} ${
          pendingBlock?.name || ''
        }`}
        message={
          pendingBlock?.blocked
            ? `Remove ${pendingBlock?.name} from the deny list? Traffic will no longer be dropped.`
            : `Block all traffic to and from ${pendingBlock?.name}? Blocked destinations are dropped for all devices and logged as drop:geo events.`
        }
        actionLabel={pendingBlock?.blocked ? 'Unblock' : 'Block'}
        onConfirm={confirmBlockToggle}
        onClose={() => setPendingBlock(null)}
      />
    </View>
  )
}

export default TrafficInsights
