import React, { useEffect, useRef, useState } from 'react'
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonGroup,
  ButtonIcon,
  ButtonSpinner,
  ButtonText,
  Divider,
  HStack,
  Heading,
  Icon,
  InfoIcon,
  Input,
  InputField,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pressable,
  ScrollView,
  Switch,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { useNavigate } from 'react-router-native'

import {
  ActivityIcon,
  ArrowDownIcon,
  ChevronRightIcon,
  GaugeIcon,
  GlobeIcon,
  RefreshCwIcon,
  SettingsIcon,
  TimerIcon,
  WifiOffIcon,
  XIcon,
  ZapIcon
} from 'lucide-react-native'

import { wanAPI } from 'api'
import { Tooltip } from 'components/Tooltip'
import WanHealthChart from 'components/Wan/WanHealthChart'
import { AlertContext } from 'AppContext'

const RANGES = [
  { label: '1h', scale: 'minutes', count: 60 },
  { label: '24h', scale: 'minutes', count: 1440 },
  { label: '30d', scale: 'hours', count: 720 }
]

const UPTIME_BUCKETS = 48
const UPTIME_BUCKET_MINUTES = 30

const cardStyle = {
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '$muted200',
  bg: '$backgroundCardLight',
  sx: { _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }
}

const fmtDuration = (seconds) => {
  if (!seconds) return '0m'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.round((seconds % 86400) / 3600)}h`
}

const fmtTime = (unix) => {
  if (!unix) return ''
  return new Date(unix * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const fmtAvailability = (downtime) => {
  const pct = ((86400 - Math.min(downtime || 0, 86400)) / 86400) * 100
  return pct >= 99.995 ? '100%' : `${pct.toFixed(2)}%`
}

const StatusDot = ({ color, size = 10 }) => (
  <Box w={size} h={size} borderRadius={999} bg={color} />
)

const SectionLabel = ({ children }) => (
  <Text
    size="2xs"
    bold
    color="$muted400"
    letterSpacing={1.2}
    textTransform="uppercase"
  >
    {children}
  </Text>
)

const SummaryTile = ({ icon, iconColor, label, value, sub }) => (
  <Box {...cardStyle} px="$4" py="$3" flex={1} minWidth={160}>
    <HStack space="md" alignItems="center">
      <Icon as={icon} color={iconColor} size="lg" />
      <VStack flex={1}>
        <Text size="2xs" color="$muted500">
          {label}
        </Text>
        <HStack space="sm" alignItems="baseline">
          <Text size="lg" bold>
            {value}
          </Text>
          {sub ? (
            <Text size="2xs" color="$muted400">
              {sub}
            </Text>
          ) : null}
        </HStack>
      </VStack>
    </HStack>
  </Box>
)

const KPI = ({ value, unit, label }) => (
  <VStack flex={1} alignItems="center" space="xs">
    <HStack space="xs" alignItems="baseline">
      <Text size="xl" bold>
        {value}
      </Text>
      <Text size="2xs" color="$muted500">
        {unit}
      </Text>
    </HStack>
    <Text size="2xs" color="$muted500">
      {label}
    </Text>
  </VStack>
)

const uptimeBuckets = (samples) => {
  const buckets = []
  for (let index = 0; index < UPTIME_BUCKETS; index++) {
    const start = index * UPTIME_BUCKET_MINUTES
    const slice = (samples || []).slice(start, start + UPTIME_BUCKET_MINUTES)
    if (!slice.length) {
      buckets.push('empty')
      continue
    }
    if (slice.some((sample) => !sample.Up)) {
      buckets.push('down')
    } else if (
      slice.reduce((sum, sample) => sum + sample.LossPct, 0) / slice.length >
      5
    ) {
      buckets.push('lossy')
    } else {
      buckets.push('up')
    }
  }
  return buckets.reverse()
}

const UPTIME_COLORS = {
  up: '$success400',
  lossy: '$warning400',
  down: '$error500',
  empty: '$muted200'
}

const UptimeBar = ({ samples, downtime }) => (
  <VStack space="xs">
    <HStack space="xs" alignItems="center">
      {uptimeBuckets(samples).map((state, index) => (
        <Box
          key={index}
          flex={1}
          h={16}
          borderRadius={2}
          bg={UPTIME_COLORS[state]}
          sx={
            state == 'empty' ? { _dark: { bg: '$muted800' } } : undefined
          }
        />
      ))}
    </HStack>
    <HStack justifyContent="space-between">
      <Text size="2xs" color="$muted400">
        24h ago
      </Text>
      <Text size="2xs" color="$muted500">
        {fmtAvailability(downtime)} available
      </Text>
      <Text size="2xs" color="$muted400">
        now
      </Text>
    </HStack>
  </VStack>
)

const UplinkCard = ({
  status,
  samples,
  speedResult,
  speedRunning,
  onSpeedTest,
  onManage
}) => {
  const statusInfo = status.Up
    ? status.Active
      ? { label: 'Online', color: '$success500', action: 'success' }
      : { label: 'Recovering', color: '$warning500', action: 'warning' }
    : { label: 'Offline', color: '$error500', action: 'error' }

  return (
    <Box {...cardStyle} flex={1} minWidth={300} maxWidth={480}>
      <VStack space="md" p="$4">
        <HStack justifyContent="space-between" alignItems="center">
          <Pressable onPress={onManage} flexShrink={1}>
            <HStack space="sm" alignItems="center">
              <StatusDot color={statusInfo.color} />
              <Heading size="sm">{status.Iface}</Heading>
              <Icon as={ChevronRightIcon} color="$muted400" size="sm" />
              <Text size="2xs" color="$muted400">
                {status.Gateway ? `via ${status.Gateway}` : 'no gateway'}
              </Text>
            </HStack>
          </Pressable>
          <Badge action={statusInfo.action} variant="outline" size="sm">
            <BadgeText>{statusInfo.label}</BadgeText>
          </Badge>
        </HStack>

        <HStack alignItems="center" py="$2">
          <KPI
            value={status.LatencyMs ? status.LatencyMs.toFixed(1) : '—'}
            unit="ms"
            label="Latency"
          />
          <Divider orientation="vertical" h="$8" />
          <KPI
            value={status.JitterMs ? status.JitterMs.toFixed(1) : '—'}
            unit="ms"
            label="Jitter"
          />
          <Divider orientation="vertical" h="$8" />
          <KPI
            value={status.LossPct != null ? status.LossPct.toFixed(1) : '—'}
            unit="%"
            label="Loss"
          />
        </HStack>

        <UptimeBar samples={samples} downtime={status.Downtime24h} />

        <Divider />

        <HStack justifyContent="space-between" alignItems="center">
          <HStack space="md" alignItems="center">
            <Icon as={ArrowDownIcon} size="sm" color="$muted400" />
            <VStack>
              <HStack space="xs" alignItems="baseline">
                <Text size="sm" bold>
                  {speedResult && !speedResult.Error
                    ? `${speedResult.DownMbps.toFixed(1)} Mbps`
                    : 'No speed test yet'}
                </Text>
                {speedResult && !speedResult.Error ? (
                  <Text size="2xs" color="$muted400">
                    {fmtTime(speedResult.Time)}
                  </Text>
                ) : null}
              </HStack>
              {speedResult && !speedResult.Error && speedResult.URL ? (
                <Text size="2xs" color="$muted400">
                  via {speedResult.URL.replace(/^https?:\/\//, '').split('/')[0]}
                </Text>
              ) : null}
            </VStack>
          </HStack>
          <Button
            size="xs"
            variant="outline"
            action="primary"
            isDisabled={speedRunning || !status.Up}
            onPress={() => onSpeedTest(status.Iface)}
          >
            {speedRunning ? (
              <ButtonSpinner mr="$1" />
            ) : (
              <ButtonIcon as={GaugeIcon} mr="$1" />
            )}
            <ButtonText>Test</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}

const OutageTable = ({ outages }) => (
  <VStack>
    <HStack
      px="$4"
      py="$2"
      borderBottomWidth={1}
      borderColor="$muted100"
      sx={{ _dark: { borderColor: '$muted800' } }}
    >
      <Box w={90}>
        <SectionLabel>WAN</SectionLabel>
      </Box>
      <Box flex={1}>
        <SectionLabel>Started</SectionLabel>
      </Box>
      <Box flex={1} display="none" sx={{ '@md': { display: 'flex' } }}>
        <SectionLabel>Cause</SectionLabel>
      </Box>
      <Box w={100} alignItems="flex-end">
        <SectionLabel>Duration</SectionLabel>
      </Box>
    </HStack>
    {outages.slice(0, 20).map((outage, index) => {
      const ongoing = !outage.End
      const duration = ongoing
        ? Math.max(0, Math.floor(Date.now() / 1000) - outage.Start)
        : outage.End - outage.Start
      return (
        <HStack
          key={index}
          px="$4"
          py="$3"
          alignItems="center"
          borderBottomWidth={index == Math.min(outages.length, 20) - 1 ? 0 : 1}
          borderColor="$muted100"
          sx={{ _dark: { borderColor: '$muted800' } }}
        >
          <Box w={90}>
            <HStack space="sm" alignItems="center">
              <StatusDot
                color={ongoing ? '$error500' : '$muted300'}
                size={8}
              />
              <Text size="sm" bold>
                {outage.Iface}
              </Text>
            </HStack>
          </Box>
          <Box flex={1}>
            <Text size="sm">{fmtTime(outage.Start)}</Text>
          </Box>
          <Box flex={1} display="none" sx={{ '@md': { display: 'flex' } }}>
            <Text size="sm" color="$muted500">
              {outage.Reason || '—'}
            </Text>
          </Box>
          <Box w={100} alignItems="flex-end">
            {ongoing ? (
              <Badge action="error" variant="solid" size="sm">
                <BadgeText>{fmtDuration(duration)}</BadgeText>
              </Badge>
            ) : (
              <Text size="sm" color="$muted500">
                {fmtDuration(duration)}
              </Text>
            )}
          </Box>
        </HStack>
      )
    })}
  </VStack>
)

const SettingsModal = ({ show, onClose, config, onSave }) => {
  const [enabled, setEnabled] = useState(!!config?.Enabled)
  const [failover, setFailover] = useState(!!config?.FailoverEnabled)
  const [targets, setTargets] = useState((config?.ProbeTargets || []).join(', '))
  const [speedUrl, setSpeedUrl] = useState(config?.SpeedTestURL || '')

  useEffect(() => {
    if (show && config) {
      setEnabled(!!config.Enabled)
      setFailover(!!config.FailoverEnabled)
      setTargets((config.ProbeTargets || []).join(', '))
      setSpeedUrl(config.SpeedTestURL || '')
    }
  }, [show])

  const settingRow = (label, info, control) => (
    <HStack justifyContent="space-between" alignItems="center" minHeight={36}>
      <HStack space="sm" alignItems="center">
        <Text size="sm">{label}</Text>
        {info ? (
          <Tooltip label={info}>
            <Icon as={InfoIcon} color="$muted400" size="sm" />
          </Tooltip>
        ) : null}
      </HStack>
      {control}
    </HStack>
  )

  return (
    <Modal isOpen={show} onClose={onClose}>
      <ModalBackdrop />
      <ModalContent maxWidth={440}>
        <ModalHeader>
          <VStack>
            <SectionLabel>Internet Health</SectionLabel>
            <Heading size="sm">Monitoring Settings</Heading>
          </VStack>
          <Button variant="link" size="sm" onPress={onClose}>
            <ButtonIcon as={XIcon} />
          </Button>
        </ModalHeader>
        <ModalBody>
          <VStack space="lg" py="$2">
            {settingRow(
              'Monitoring',
              'Ping probe targets from every WAN uplink',
              <Switch value={enabled} onValueChange={setEnabled} />
            )}
            {settingRow(
              'Failover',
              'Route around unhealthy uplinks automatically',
              <Switch
                value={failover}
                onValueChange={setFailover}
                isDisabled={!enabled}
              />
            )}
            <VStack space="xs">
              <Text size="sm">Probe targets</Text>
              <Input size="sm">
                <InputField
                  value={targets}
                  onChangeText={setTargets}
                  placeholder="1.1.1.1, 8.8.8.8"
                />
              </Input>
            </VStack>
            <VStack space="xs">
              <Text size="sm">Speed test server</Text>
              <Input size="sm">
                <InputField
                  value={speedUrl}
                  onChangeText={setSpeedUrl}
                  placeholder="https://speed.cloudflare.com/__down?bytes=33554432"
                />
              </Input>
            </VStack>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack space="sm">
            <Button size="sm" variant="outline" action="secondary" onPress={onClose}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              size="sm"
              action="primary"
              onPress={() =>
                onSave({
                  ...config,
                  Enabled: enabled,
                  FailoverEnabled: failover,
                  ProbeTargets: targets
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length),
                  SpeedTestURL: speedUrl.trim()
                })
              }
            >
              <ButtonText>Save</ButtonText>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

const WanHealth = () => {
  const context = React.useContext(AlertContext)
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState([])
  const [outages, setOutages] = useState([])
  const [histories, setHistories] = useState({})
  const [barHistories, setBarHistories] = useState({})
  const [speedResults, setSpeedResults] = useState([])
  const [speedRunning, setSpeedRunning] = useState({})
  const [metric, setMetric] = useState('latency')
  const [range, setRange] = useState(RANGES[1])
  const [showSettings, setShowSettings] = useState(false)
  const timerRef = useRef(null)

  const fetchStatus = () => {
    wanAPI
      .config()
      .then((result) => setConfig(result))
      .catch(() => {})
    wanAPI
      .status()
      .then((result) => setStatus(result || []))
      .catch(() => {})
    wanAPI
      .outages()
      .then((result) => setOutages(result || []))
      .catch(() => {})
    wanAPI
      .speedResults()
      .then((result) => setSpeedResults(result || []))
      .catch(() => {})
  }

  const fetchHistories = (uplinks, selectedRange) => {
    Promise.all(
      uplinks.map((iface) =>
        wanAPI
          .history(iface, selectedRange.scale, selectedRange.count)
          .then((samples) => [iface, samples || []])
          .catch(() => [iface, []])
      )
    ).then((entries) => setHistories(Object.fromEntries(entries)))
  }

  const fetchBarHistories = (uplinks) => {
    Promise.all(
      uplinks.map((iface) =>
        wanAPI
          .history(iface, 'minutes', 1440)
          .then((samples) => [iface, samples || []])
          .catch(() => [iface, []])
      )
    ).then((entries) => setBarHistories(Object.fromEntries(entries)))
  }

  useEffect(() => {
    fetchStatus()
    timerRef.current = setInterval(fetchStatus, 15 * 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (status.length) {
      fetchHistories(
        status.map((uplink) => uplink.Iface),
        range
      )
      fetchBarHistories(status.map((uplink) => uplink.Iface))
    }
  }, [status.length, range])

  const saveConfig = (data) => {
    wanAPI
      .setConfig(data)
      .then((result) => {
        setConfig(result)
        setShowSettings(false)
        context.success('Monitoring settings saved')
      })
      .catch((err) => context.error('Failed to save settings', err))
  }

  const onSpeedTest = (iface) => {
    setSpeedRunning((current) => ({ ...current, [iface]: true }))
    wanAPI
      .runSpeedTest(iface)
      .then((result) => {
        if (result.Error) {
          context.error(`Speed test failed: ${result.Error}`)
        } else {
          context.success(
            `${iface}: ${result.DownMbps.toFixed(1)} Mbps download`
          )
        }
        fetchStatus()
      })
      .catch((err) => context.error('Speed test failed', err))
      .finally(() =>
        setSpeedRunning((current) => ({ ...current, [iface]: false }))
      )
  }

  const lastSpeedFor = (iface) =>
    speedResults.find((result) => result.Iface == iface)

  const enabled = !!config?.Enabled
  const upCount = status.filter((uplink) => uplink.Up).length
  const overall =
    !status.length || !enabled
      ? { label: '—', color: '$muted400', icon: GlobeIcon }
      : upCount == status.length
      ? { label: 'Healthy', color: '$success500', icon: GlobeIcon }
      : upCount > 0
      ? { label: 'Degraded', color: '$warning500', icon: ActivityIcon }
      : { label: 'Down', color: '$error500', icon: WifiOffIcon }
  const bestDowntime = status.length
    ? Math.min(...status.map((uplink) => uplink.Downtime24h || 0))
    : 0
  const activeLatency = status.filter((uplink) => uplink.Up && uplink.LatencyMs)
  const avgLatency = activeLatency.length
    ? activeLatency.reduce((sum, uplink) => sum + uplink.LatencyMs, 0) /
      activeLatency.length
    : 0

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="md" p="$4">
        <HStack justifyContent="space-between" alignItems="center">
          <VStack>
            <Heading size="md">Internet Health</Heading>
            <Text size="xs" color="$muted500">
              Latency, packet loss, outages and speed for every WAN uplink
            </Text>
          </VStack>
          <HStack space="sm">
            <Button
              size="sm"
              action="secondary"
              variant="outline"
              onPress={fetchStatus}
            >
              <ButtonIcon as={RefreshCwIcon} />
            </Button>
            <Button
              size="sm"
              action="secondary"
              variant="outline"
              onPress={() => setShowSettings(true)}
            >
              <ButtonIcon as={SettingsIcon} />
            </Button>
          </HStack>
        </HStack>

        {config && !enabled ? (
          <Box {...cardStyle} p="$6">
            <VStack space="md" alignItems="flex-start">
              <HStack space="sm" alignItems="center">
                <Icon as={ActivityIcon} color="$muted400" size="lg" />
                <Heading size="sm">Monitoring is off</Heading>
              </HStack>
              <Text size="sm" color="$muted500" maxWidth={640}>
                When enabled, SPR sends small ICMP pings from each WAN uplink
                to {(config.ProbeTargets || []).join(', ')} to measure latency,
                packet loss and outages, and can fail traffic over to a healthy
                uplink. Speed tests run only when you press Test and download
                from {config.SpeedTestURL?.replace(/^https?:\/\//, '').split('/')[0]}
                . Nothing is sent until you turn it on.
              </Text>
              <HStack space="sm">
                <Button
                  size="sm"
                  action="primary"
                  onPress={() => saveConfig({ ...config, Enabled: true })}
                >
                  <ButtonText>Enable Monitoring</ButtonText>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  action="secondary"
                  onPress={() => setShowSettings(true)}
                >
                  <ButtonIcon as={SettingsIcon} mr="$1" />
                  <ButtonText>Configure</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </Box>
        ) : null}

        {enabled ? (
          <>
            <HStack space="md" flexWrap="wrap" rowGap="$3">
              <SummaryTile
                icon={overall.icon}
                iconColor={overall.color}
                label="Internet"
                value={overall.label}
              />
              <SummaryTile
                icon={GlobeIcon}
                iconColor="$primary500"
                label="Active WANs"
                value={`${upCount} / ${status.length}`}
              />
              <SummaryTile
                icon={TimerIcon}
                iconColor="$primary500"
                label="Availability (24h)"
                value={fmtAvailability(bestDowntime)}
              />
              <SummaryTile
                icon={ZapIcon}
                iconColor="$primary500"
                label="Avg latency"
                value={avgLatency ? avgLatency.toFixed(1) : '—'}
                sub="ms"
              />
            </HStack>

            <HStack space="md" flexWrap="wrap" rowGap="$3">
              {status.map((uplink) => (
                <UplinkCard
                  key={uplink.Iface}
                  status={uplink}
                  samples={barHistories[uplink.Iface]}
                  speedResult={lastSpeedFor(uplink.Iface)}
                  speedRunning={!!speedRunning[uplink.Iface]}
                  onSpeedTest={onSpeedTest}
                  onManage={() => navigate('/admin/uplink')}
                />
              ))}
              {!status.length ? (
                <Text color="$muted500" p="$4">
                  No enabled WAN uplinks found
                </Text>
              ) : null}
            </HStack>

            <Box {...cardStyle} p="$4">
              <VStack space="md">
                <HStack
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  rowGap="$2"
                >
                  <VStack>
                    <SectionLabel>Performance</SectionLabel>
                    <Heading size="sm">
                      {metric == 'latency' ? 'Latency' : 'Packet loss'}
                    </Heading>
                  </VStack>
                  <HStack space="md">
                    <ButtonGroup size="xs" isAttached>
                      <Button
                        variant={metric == 'latency' ? 'solid' : 'outline'}
                        action="primary"
                        onPress={() => setMetric('latency')}
                      >
                        <ButtonText>Latency</ButtonText>
                      </Button>
                      <Button
                        variant={metric == 'loss' ? 'solid' : 'outline'}
                        action="primary"
                        onPress={() => setMetric('loss')}
                      >
                        <ButtonText>Loss</ButtonText>
                      </Button>
                    </ButtonGroup>
                    <ButtonGroup size="xs" isAttached>
                      {RANGES.map((item) => (
                        <Button
                          key={item.label}
                          variant={
                            range.label == item.label ? 'solid' : 'outline'
                          }
                          action="secondary"
                          onPress={() => setRange(item)}
                        >
                          <ButtonText>{item.label}</ButtonText>
                        </Button>
                      ))}
                    </ButtonGroup>
                  </HStack>
                </HStack>
                <WanHealthChart histories={histories} metric={metric} />
              </VStack>
            </Box>

            <Box {...cardStyle}>
              <HStack
                p="$4"
                justifyContent="space-between"
                alignItems="center"
              >
                <VStack>
                  <SectionLabel>Reliability</SectionLabel>
                  <Heading size="sm">Outage History</Heading>
                </VStack>
                {outages.length ? (
                  <Text size="xs" color="$muted500">
                    {outages.length} recorded
                  </Text>
                ) : null}
              </HStack>
              {outages.length ? (
                <OutageTable outages={outages} />
              ) : (
                <VStack alignItems="center" py="$8" space="sm">
                  <Icon as={GlobeIcon} color="$muted300" size="xl" />
                  <Text color="$muted500" size="sm">
                    No outages recorded
                  </Text>
                </VStack>
              )}
            </Box>
          </>
        ) : null}

        <SettingsModal
          show={showSettings}
          onClose={() => setShowSettings(false)}
          config={config}
          onSave={saveConfig}
        />
      </VStack>
    </ScrollView>
  )
}

export default WanHealth
