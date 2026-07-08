import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useWindowDimensions } from 'react-native'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  HStack,
  Heading,
  Icon,
  Input,
  InputField,
  Pressable,
  ScrollView,
  Spinner,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import {
  BanIcon,
  CableIcon,
  CheckIcon,
  EarthLockIcon,
  FunnelIcon,
  GlobeIcon,
  LinkIcon,
  MaximizeIcon,
  RefreshCwIcon,
  RouterIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  TagIcon,
  TargetIcon,
  UsersIcon,
  WifiIcon,
  ZoomInIcon,
  ZoomOutIcon
} from 'lucide-react-native'

import { AlertContext } from 'AppContext'
import { classifyAPI, deviceAPI, topologyAPI } from 'api'
import IconItem from 'components/IconItem'
import { GroupItem, PolicyItem, TagItem } from 'components/TagItem'
import {
  arcPath,
  computeLayout,
  displayName,
  isIsolated,
  linkPath,
  signalColor,
  COL_WIDTH,
  NODE_ANCHOR
} from 'components/Topology/topologyLayout'

const PALETTE = {
  light: {
    canvas: '#f1f5f9',
    grid: 'rgba(100, 116, 139, 0.08)',
    link: '#2563eb',
    linkDim: 'rgba(37, 99, 235, 0.16)',
    linkMuted: 'rgba(100, 116, 139, 0.4)',
    junctionFill: '#2563eb',
    junctionText: '#ffffff',
    label: '#1d4ed8',
    sublabel: '#64748b',
    icon: '#334155',
    iconBg: '#ffffff',
    iconBorder: 'rgba(100, 116, 139, 0.25)',
    isolated: '#dc2626',
    group: '#7c3aed',
    policy: '#0891b2',
    endpoint: '#ea580c',
    selected: '#0ea5e9'
  },
  dark: {
    canvas: '#060e1a',
    grid: 'rgba(148, 163, 184, 0.05)',
    link: '#3b82f6',
    linkDim: 'rgba(59, 130, 246, 0.18)',
    linkMuted: 'rgba(148, 163, 184, 0.3)',
    junctionFill: '#3b82f6',
    junctionText: '#ffffff',
    label: '#60a5fa',
    sublabel: '#7c8aa0',
    icon: '#e2e8f0',
    iconBg: '#0f2035',
    iconBorder: 'rgba(96, 165, 250, 0.25)',
    isolated: '#f87171',
    group: '#8b5cf6',
    policy: '#0891b2',
    endpoint: '#ea580c',
    selected: '#7dd3fc'
  }
}

const INFRA_ICONS = {
  router: RouterIcon,
  uplink: GlobeIcon,
  ap_radio: WifiIcon,
  port: CableIcon,
  vpn: EarthLockIcon,
  leaf_router: RouterIcon,
  endpoint: TargetIcon
}

const nodeTitle = (node) => {
  if (node.Kind == 'uplink') return `Internet (${node.Name})`
  return displayName(node)
}

const nodeSubtitle = (node) => {
  if (node.Kind == 'device') return node.IP || (node.Online ? '' : 'offline')
  if (node.Kind == 'leaf_router' || node.Kind == 'endpoint') return node.IP
  if (node.Kind == 'ap_radio' || node.Kind == 'port') {
    return node.Iface != node.Name ? node.Iface : ''
  }
  return ''
}

const edgeDash = (node) => {
  if (!node) return null
  if (node.Kind == 'ap_radio') return null
  if (node.Kind == 'vpn' || node.ConnType == 'wireguard') return '2 6'
  if (node.ConnType == 'wifi') return '6 6'
  if (node.ConnType == 'offline') return '3 6'
  return null
}

const TopologyNode = React.memo(({ node, position, palette, selected, dimmed, onPress }) => {
  const [hovered, setHovered] = useState(false)
  const isDevice = node.Kind == 'device'
  const isolated = isIsolated(node)
  const offline = isDevice && !node.Online
  const size = node.Kind == 'router' ? 60 : 48
  const iconSize = node.Kind == 'router' ? 32 : 25

  const ringColor = isolated
    ? palette.isolated
    : selected || hovered
      ? palette.selected
      : palette.iconBorder

  return (
    <Pressable
      onPress={() => onPress(node)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: position.x - 75,
        top: position.y - size / 2,
        width: 150,
        alignItems: 'center',
        opacity: dimmed ? 0.25 : offline ? 0.45 : 1
      }}
    >
      <Box
        alignItems="center"
        justifyContent="center"
        w={size}
        h={size}
        borderRadius={14}
        borderWidth={selected || isolated ? 2 : 1}
        borderColor={ringColor}
        bg={palette.iconBg}
        style={
          selected
            ? { boxShadow: `0 0 14px ${palette.selected}66` }
            : { boxShadow: '0 2px 8px rgba(2, 8, 20, 0.25)' }
        }
      >
        {isDevice ? (
          <IconItem
            name={node.Style?.Icon || 'Laptop'}
            color={offline ? palette.sublabel : node.Style?.Color || palette.icon}
            size={iconSize}
          />
        ) : (
          <Box style={{ color: palette.icon }}>
            {React.createElement(INFRA_ICONS[node.Kind] || RouterIcon, {
              color: palette.icon,
              size: iconSize
            })}
          </Box>
        )}

        {isDevice && node.Signal ? (
          <Box
            position="absolute"
            right={-3}
            bottom={-3}
            w={11}
            h={11}
            borderRadius={9}
            borderWidth={2}
            borderColor={palette.canvas}
            bg={signalColor(node.Signal.RSSI)}
          />
        ) : null}

        {isolated ? (
          <Box position="absolute" right={-7} top={-7}>
            <BanIcon color={palette.isolated} size={15} />
          </Box>
        ) : null}
      </Box>

      <Text
        size="xs"
        mt="$1.5"
        fontWeight="$semibold"
        numberOfLines={1}
        style={{ color: isolated ? palette.isolated : palette.label }}
      >
        {nodeTitle(node)}
      </Text>
      <Box
        mt={3}
        w={26}
        h={1}
        style={{
          backgroundColor: isolated ? palette.isolated : palette.label,
          opacity: 0.45
        }}
      />
      {nodeSubtitle(node) ? (
        <Text
          size="2xs"
          mt="$0.5"
          numberOfLines={1}
          style={{ color: palette.sublabel }}
        >
          {nodeSubtitle(node)}
        </Text>
      ) : null}
    </Pressable>
  )
})

const Stat = ({ label, value }) => (
  <VStack minWidth={80}>
    <Text size="2xs" color="$muted500">
      {label}
    </Text>
    <Text size="sm" fontWeight="$semibold">
      {value}
    </Text>
  </VStack>
)

const EditablePills = ({ title, values, known, allowAdd = true, onChange }) => {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const all = [...new Set([...(known || []), ...(values || [])])].sort()

  const toggle = (name) =>
    onChange(
      values?.includes(name)
        ? values.filter((entry) => entry != name)
        : [...(values || []), name]
    )

  const add = () => {
    const name = text.trim()
    if (name && !values?.includes(name)) {
      onChange([...(values || []), name])
    }
    setText('')
    setAdding(false)
  }

  return (
    <VStack space="xs">
      <Text size="xs" color="$muted500">
        {title}
      </Text>
      <HStack space="xs" flexWrap="wrap" alignItems="center">
        {all.map((name) => {
          const active = values?.includes(name)
          return (
            <Pressable key={name} onPress={() => toggle(name)} mb="$1">
              <Badge
                action={active ? 'success' : 'muted'}
                variant={active ? 'solid' : 'outline'}
              >
                <BadgeText>{name}</BadgeText>
              </Badge>
            </Pressable>
          )
        })}
        {!allowAdd ? null : adding ? (
          <Input size="sm" w={130} mb="$1">
            <InputField
              autoFocus
              value={text}
              placeholder={`new ${title.toLowerCase().replace(/s$/, '')}`}
              onChangeText={setText}
              onSubmitEditing={add}
              onBlur={add}
            />
          </Input>
        ) : (
          <Pressable onPress={() => setAdding(true)} mb="$1">
            <Badge action="muted" variant="outline">
              <BadgeText>+</BadgeText>
            </Badge>
          </Pressable>
        )}
      </HStack>
    </VStack>
  )
}

const ChipList = ({ title, values, renderItem }) => {
  if (!values?.length) return null
  return (
    <VStack space="xs">
      <Text size="xs" color="$muted500">
        {title}
      </Text>
      <HStack space="xs" flexWrap="wrap">
        {values.map((value) => (
          <Box key={value} mb="$1">
            {renderItem ? (
              renderItem(value)
            ) : (
              <Badge action="muted" variant="solid">
                <BadgeText>{value}</BadgeText>
              </Badge>
            )}
          </Box>
        ))}
      </HStack>
    </VStack>
  )
}

const FIELD_LABELS = {
  IP: 'IP',
  TinyNet: 'Subnet /30',
  VLANTag: 'VLAN',
  MAC: 'MAC',
  Iface: 'Interface',
  ConnType: 'Connection'
}

const DetailPanel = ({
  node,
  peers,
  classification,
  options,
  compact,
  onEdit,
  onClose,
  onUpdateDevice,
  onConnect
}) => {
  const fields = ['IP', 'TinyNet', 'VLANTag', 'MAC', 'Iface', 'ConnType'].filter(
    (field) => node[field]
  )
  const identity = node.MAC || node.ID?.replace(/^dev:/, '')
  const editable = node.Kind == 'device' && identity

  const placement = compact
    ? { left: 12, right: 12, bottom: 12, maxHeight: '52%' }
    : { right: 16, top: 16, bottom: 16, w: 300 }

  return (
    <Box
      position="absolute"
      {...placement}
      borderRadius={12}
      borderWidth={1}
      borderColor="$muted200"
      sx={{
        _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' }
      }}
      bg="$backgroundCardLight"
      style={{ boxShadow: '0 8px 30px rgba(2, 8, 20, 0.35)' }}
    >
      <ScrollView p="$4">
        <VStack space="md" pb="$4">
          <HStack justifyContent="space-between" alignItems="center">
            <VStack flex={1}>
              <Heading size="sm" numberOfLines={1}>
                {nodeTitle(node)}
              </Heading>
              <Text
                size="xs"
                color={
                  isIsolated(node)
                    ? '$red500'
                    : node.Online
                      ? '$success500'
                      : '$muted500'
                }
              >
                {isIsolated(node)
                  ? 'Isolated'
                  : node.Online
                    ? 'Online'
                    : 'Offline'}
                {node.Kind && node.Kind != 'device'
                  ? ` · ${node.Kind.replace('_', ' ')}`
                  : ''}
              </Text>
            </VStack>
            <Button size="xs" variant="link" onPress={onClose}>
              <ButtonIcon as={CloseIcon} />
            </Button>
          </HStack>

          {fields.map((field) => (
            <HStack key={field} justifyContent="space-between" space="md">
              <Text size="xs" color="$muted500">
                {FIELD_LABELS[field]}
              </Text>
              <Text size="xs" maxWidth={170} textAlign="right">
                {node[field]}
              </Text>
            </HStack>
          ))}

          {classification ? (
            <HStack justifyContent="space-between" space="md">
              <Text size="xs" color="$muted500">
                Classification
              </Text>
              <Text size="xs">{classification}</Text>
            </HStack>
          ) : null}

          {node.Signal ? (
            <HStack space="md">
              <Stat label="RSSI" value={`${node.Signal.RSSI} dBm`} />
              <Stat label="TX" value={node.Signal.TxRate || 0} />
              <Stat label="RX" value={node.Signal.RxRate || 0} />
            </HStack>
          ) : null}

          {editable ? (
            <>
              <EditablePills
                title="Policies"
                values={node.Policies}
                known={EDITABLE_POLICIES}
                allowAdd={false}
                onChange={(next) => onUpdateDevice(identity, { Policies: next })}
              />
              <EditablePills
                title="Groups"
                values={node.Groups}
                known={options?.groups}
                onChange={(next) => onUpdateDevice(identity, { Groups: next })}
              />
              <EditablePills
                title="Tags"
                values={node.Tags}
                known={options?.tags}
                onChange={(next) => onUpdateDevice(identity, { DeviceTags: next })}
              />
            </>
          ) : (
            <>
              <ChipList
                title="Groups"
                values={node.Groups}
                renderItem={(name) => <GroupItem name={name} size="sm" />}
              />
              <ChipList
                title="Policies"
                values={node.Policies}
                renderItem={(name) => <PolicyItem name={name} size="sm" />}
              />
              <ChipList
                title="Tags"
                values={node.Tags}
                renderItem={(name) => <TagItem name={name} size="sm" />}
              />
            </>
          )}

          {node.Kind == 'device' && peers ? (
            <VStack space="xs">
              <Text size="xs" color="$muted500">
                Access
              </Text>
              {peers.isolated ? (
                <Text size="sm">None — device is isolated</Text>
              ) : (
                <>
                  <Text size="sm">
                    Can connect to: {peers.canReach.length} device
                    {peers.canReach.length == 1 ? '' : 's'}
                    {peers.endpoints.length
                      ? `, ${peers.endpoints.length} endpoint${
                          peers.endpoints.length == 1 ? '' : 's'
                        }`
                      : ''}
                  </Text>
                  <Text size="sm">
                    Reachable from: {peers.reachableFrom.length} device
                    {peers.reachableFrom.length == 1 ? '' : 's'}
                  </Text>
                  {peers.endpoints.map((endpoint) => (
                    <HStack key={endpoint.ID} space="xs" alignItems="center">
                      <Icon as={TargetIcon} color="$amber500" size={14} />
                      <Text size="xs" fontWeight="$medium">
                        {endpoint.Name}
                      </Text>
                      <Text size="xs" color="$muted500" flex={1} numberOfLines={1}>
                        {endpoint.IP}
                        {endpoint.Via.length ? ` · via ${endpoint.Via.join(', ')}` : ''}
                      </Text>
                    </HStack>
                  ))}
                </>
              )}
            </VStack>
          ) : null}

          {node.Kind == 'endpoint' && peers?.endpointClients ? (
            <VStack space="xs">
              <Text size="xs" color="$muted500">
                Allowed clients
              </Text>
              {peers.endpointClients.length ? (
                <HStack space="xs" flexWrap="wrap">
                  {peers.endpointClients.map((client) => (
                    <Badge key={client.ID} action="muted" variant="solid" mb="$1">
                      <BadgeText>{client.Name}</BadgeText>
                    </Badge>
                  ))}
                </HStack>
              ) : (
                <Text size="sm">None — no devices carry this tag</Text>
              )}
            </VStack>
          ) : null}

          {editable ? (
            <VStack space="sm">
              <Button
                size="xs"
                action={isIsolated(node) ? 'secondary' : 'negative'}
                variant="outline"
                onPress={() =>
                  onUpdateDevice(identity, {
                    Policies: isIsolated(node)
                      ? (node.Policies || []).filter(
                          (policy) => policy != 'quarantine'
                        )
                      : [...new Set([...(node.Policies || []), 'quarantine'])]
                  })
                }
              >
                <ButtonIcon as={BanIcon} mr="$1" />
                <ButtonText>
                  {isIsolated(node) ? 'Release from quarantine' : 'Quarantine'}
                </ButtonText>
              </Button>
              <Button
                size="xs"
                action="secondary"
                variant="outline"
                onPress={() => onConnect(node)}
              >
                <ButtonIcon as={LinkIcon} mr="$1" />
                <ButtonText>Connect device…</ButtonText>
              </Button>
              <Button
                size="sm"
                action="primary"
                variant="solid"
                onPress={() => onEdit(identity)}
              >
                <ButtonText>Edit Device</ButtonText>
              </Button>
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </Box>
  )
}

const linkPanelInfo = (link, byID) => {
  const a = byID[link.a]
  const b = byID[link.b]
  if (!a || !b) return null

  if (link.layer == 'policy') {
    const kind = link.kind
    let type = 'Policy'
    const rows = []
    if (kind.startsWith('group:')) {
      type = 'Group (two-way)'
      rows.push({ label: 'Group', value: kind.slice(6) })
    } else if (kind == 'policy:lan') {
      type = 'lan policy (one-way)'
    } else if (kind == 'policy:wan') {
      type = 'wan policy (one-way)'
    } else if (kind.startsWith('endpoint:')) {
      type = 'Endpoint access (one-way)'
      rows.push({ label: 'Destination', value: b.IP })
      if (b.Tags?.length) rows.push({ label: 'Tags', value: b.Tags.join(', ') })
    }
    return {
      title: `${displayName(a)} ${link.bidir ? '↔' : '→'} ${displayName(b)}`,
      type,
      rows,
      device: null
    }
  }

  const device = [a, b].find((node) => node.Kind == 'device')
  const radio = [a, b].find((node) => node.Kind == 'ap_radio')
  const rows = []
  let type = 'Wired'

  if (radio && device) {
    type = 'WiFi'
    if (radio.SSID) rows.push({ label: 'SSID', value: radio.SSID })
    rows.push({ label: 'AP', value: radio.Name })
  } else if (radio) {
    type = 'WiFi radio'
    if (radio.SSID) rows.push({ label: 'SSID', value: radio.SSID })
  } else if (device?.ConnType == 'wireguard' || [a, b].some((n) => n.Kind == 'vpn')) {
    type = 'WireGuard'
  } else if ([a, b].some((n) => n.Kind == 'uplink')) {
    type = 'Uplink'
  } else if ([a, b].some((n) => n.Kind == 'leaf_router')) {
    type = 'Mesh (wired)'
  } else if (device?.ConnType == 'offline') {
    type = 'Offline'
  }

  if (device) {
    if (device.MAC) rows.push({ label: 'MAC', value: device.MAC })
    if (device.Iface) rows.push({ label: 'Interface', value: device.Iface })
    if (device.VLANTag) rows.push({ label: 'VLAN', value: device.VLANTag })
    if (device.IP) rows.push({ label: 'IP', value: device.IP })
  } else {
    const iface = [a, b].find((node) => node.Iface)
    if (iface?.Iface) rows.push({ label: 'Interface', value: iface.Iface })
    const leaf = [a, b].find((node) => node.Kind == 'leaf_router')
    if (leaf?.IP) rows.push({ label: 'Leaf router', value: leaf.IP })
  }

  return {
    title: `${displayName(a)} ⇄ ${displayName(b)}`,
    type,
    rows,
    device
  }
}

const LinkPanel = ({ link, byID, compact, onClose }) => {
  const info = linkPanelInfo(link, byID)
  if (!info) return null

  const placement = compact
    ? { left: 12, right: 12, bottom: 12, maxHeight: '52%' }
    : { right: 16, top: 16, w: 300 }

  return (
    <Box
      position="absolute"
      {...placement}
      borderRadius={12}
      borderWidth={1}
      borderColor="$muted200"
      sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
      bg="$backgroundCardLight"
      style={{ boxShadow: '0 8px 30px rgba(2, 8, 20, 0.35)' }}
      p="$4"
    >
      <VStack space="md">
        <HStack justifyContent="space-between" alignItems="center">
          <VStack flex={1}>
            <Heading size="xs" numberOfLines={1}>
              {info.title}
            </Heading>
            <Text size="xs" color="$muted500">
              {info.type}
            </Text>
          </VStack>
          <Button size="xs" variant="link" onPress={onClose}>
            <ButtonIcon as={CloseIcon} />
          </Button>
        </HStack>

        {info.rows.map((row) => (
          <HStack key={row.label} justifyContent="space-between" space="md">
            <Text size="xs" color="$muted500">
              {row.label}
            </Text>
            <Text size="xs" maxWidth={180} textAlign="right" numberOfLines={1}>
              {row.value}
            </Text>
          </HStack>
        ))}

        {info.device?.Signal ? (
          <HStack space="md">
            <VStack minWidth={80}>
              <Text size="2xs" color="$muted500">
                RSSI
              </Text>
              <Text
                size="sm"
                fontWeight="$semibold"
                style={{ color: signalColor(info.device.Signal.RSSI) }}
              >
                {info.device.Signal.RSSI} dBm
              </Text>
            </VStack>
            <Stat label="TX rate" value={info.device.Signal.TxRate || 0} />
            <Stat label="RX rate" value={info.device.Signal.RxRate || 0} />
          </HStack>
        ) : null}
      </VStack>
    </Box>
  )
}

const EDITABLE_POLICIES = ['wan', 'dns', 'dns:family', 'lan', 'lan_upstream', 'noapi']

const FILTER_SECTIONS = [
  { key: 'groups', title: 'Groups', icon: UsersIcon },
  { key: 'tags', title: 'Tags', icon: TagIcon },
  { key: 'policies', title: 'Policies', icon: ShieldCheckIcon },
  { key: 'classifications', title: 'Classification', icon: ScanSearchIcon }
]

const FilterPanel = ({ options, filter, onToggle, onClear }) => (
  <VStack
    position="absolute"
    top={56}
    left={16}
    w={230}
    maxHeight={440}
    borderRadius={10}
    borderWidth={1}
    borderColor="$muted200"
    sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
    bg="$backgroundCardLight"
    style={{ boxShadow: '0 8px 30px rgba(2, 8, 20, 0.35)' }}
  >
    <ScrollView p="$2">
      {FILTER_SECTIONS.map((section) =>
        options[section.key].length ? (
          <VStack key={section.key} mb="$2">
            <Text size="2xs" color="$muted500" px="$2" py="$1" fontWeight="$semibold">
              {section.title.toUpperCase()}
            </Text>
            {options[section.key].map((name) => {
              const selected = filter[section.key].includes(name)
              return (
                <Pressable
                  key={name}
                  onPress={() => onToggle(section.key, name)}
                  px="$2"
                  py="$1.5"
                  borderRadius={6}
                  sx={{
                    ':hover': { bg: '$muted100' },
                    _dark: { ':hover': { bg: '$muted800' } }
                  }}
                >
                  <HStack space="sm" alignItems="center">
                    <Icon
                      as={section.icon}
                      size={13}
                      color={selected ? '$primary500' : '$muted400'}
                    />
                    <Text
                      size="xs"
                      flex={1}
                      fontWeight={selected ? '$semibold' : '$normal'}
                    >
                      {name}
                    </Text>
                    {selected ? (
                      <Icon as={CheckIcon} size={14} color="$primary500" />
                    ) : null}
                  </HStack>
                </Pressable>
              )
            })}
          </VStack>
        ) : null
      )}
    </ScrollView>
    <Button size="xs" variant="link" action="secondary" onPress={onClear} m="$1">
      <ButtonText>Clear filters</ButtonText>
    </Button>
  </VStack>
)

const LegendRow = ({ palette, dash, color, label, ring, arrow }) => (
  <HStack space="sm" alignItems="center">
    {ring ? (
      <Box
        w={12}
        h={12}
        borderRadius={4}
        borderWidth={2}
        borderColor={color || palette.isolated}
      />
    ) : (
      <svg width={26} height={10}>
        <line
          x1={0}
          y1={5}
          x2={arrow ? 20 : 26}
          y2={5}
          stroke={color || palette.link}
          strokeWidth={2}
          strokeDasharray={dash}
        />
        {arrow ? (
          <path d="M 19 1 L 26 5 L 19 9 z" fill={color || palette.link} />
        ) : null}
      </svg>
    )}
    <Text size="2xs" style={{ color: palette.sublabel }}>
      {label}
    </Text>
  </HStack>
)

const Topology = () => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()
  const colorMode = useColorMode()
  const palette = PALETTE[colorMode] || PALETTE.light

  const [topology, setTopology] = useState(null)
  const [selectedID, setSelectedID] = useState(null)
  const [collapsed, setCollapsed] = useState([])
  const [mode, setMode] = useState('physical')
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedLinkID, setSelectedLinkID] = useState(null)
  const [connectFrom, setConnectFrom] = useState(null)
  const [connectTarget, setConnectTarget] = useState(null)
  const [connectChoice, setConnectChoice] = useState('')
  const [classifications, setClassifications] = useState({})
  const [deviceFilter, setDeviceFilter] = useState({
    groups: [],
    tags: [],
    policies: [],
    classifications: []
  })

  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const movedRef = useRef(false)
  const fittedRef = useRef(false)
  const requestSeqRef = useRef(0)
  const pollErrorRef = useRef(false)

  const { width: windowWidth } = useWindowDimensions()
  const compact = windowWidth < 600

  const refresh = () => {
    const seq = ++requestSeqRef.current
    topologyAPI
      .getTopology()
      .then((data) => {
        if (seq != requestSeqRef.current) return
        pollErrorRef.current = false
        setTopology(data)
        setSelectedID((current) =>
          data?.Nodes?.some((node) => node.ID == current) ? current : null
        )
      })
      .catch((error) => {
        if (seq != requestSeqRef.current || pollErrorRef.current) return
        pollErrorRef.current = true
        context.error('API failed to get topology', error)
      })
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10000)

    classifyAPI
      .list()
      .then((entries) => {
        const byMAC = {}
        entries?.forEach((entry) => {
          if (entry.MAC && entry.Category && entry.Category != 'unknown') {
            byMAC[entry.MAC.toLowerCase()] = entry.Category
          }
        })
        setClassifications(byMAC)
      })
      .catch(() => {})

    return () => clearInterval(timer)
  }, [])

  const nodes = topology?.Nodes || []
  const edges = topology?.Edges || []

  const filterActive =
    deviceFilter.groups.length > 0 ||
    deviceFilter.tags.length > 0 ||
    deviceFilter.policies.length > 0 ||
    deviceFilter.classifications.length > 0

  const classOf = (node) => classifications[node.MAC?.toLowerCase()]

  const filterOptions = useMemo(() => {
    const groups = new Set()
    const tags = new Set()
    const policies = new Set()
    const classes = new Set()
    nodes
      .filter((node) => node.Kind == 'device')
      .forEach((node) => {
        node.Groups?.forEach((group) => groups.add(group))
        node.Tags?.forEach((tag) => tags.add(tag))
        node.Policies?.forEach((policy) => policies.add(policy))
        if (classOf(node)) classes.add(classOf(node))
      })
    return {
      groups: [...groups].sort(),
      tags: [...tags].sort(),
      policies: [...policies].sort(),
      classifications: [...classes].sort()
    }
  }, [nodes, classifications])

  const filteredNodes = useMemo(() => {
    const deviceMatch = (node) =>
      !filterActive ||
      node.Groups?.some((group) => deviceFilter.groups.includes(group)) ||
      node.Tags?.some((tag) => deviceFilter.tags.includes(tag)) ||
      node.Policies?.some((policy) => deviceFilter.policies.includes(policy)) ||
      deviceFilter.classifications.includes(classOf(node))

    const visibleDevices = nodes.filter(
      (node) => node.Kind == 'device' && deviceMatch(node)
    )

    return nodes.filter((node) => {
      if (node.Kind == 'device') return deviceMatch(node)
      if (node.Kind == 'endpoint') {
        if (connectFrom) return true
        return visibleDevices.some(
          (device) =>
            !isIsolated(device) &&
            device.Tags?.some((tag) => node.Tags?.includes(tag))
        )
      }
      return true
    })
  }, [nodes, deviceFilter, filterActive, classifications, connectFrom])

  const toggleFilter = (section, name) => {
    setDeviceFilter((current) => ({
      ...current,
      [section]: current[section].includes(name)
        ? current[section].filter((entry) => entry != name)
        : [...current[section], name]
    }))
  }

  useEffect(() => {
    if (selectedID && !filteredNodes.some((node) => node.ID == selectedID)) {
      setSelectedID(null)
    }
  }, [filteredNodes, selectedID])

  useEffect(() => {
    if (!filterOpen) return
    const onDocDown = (event) => {
      if (!event.target.closest('[data-topo-filter]')) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [filterOpen])

  const layout = useMemo(
    () => computeLayout(filteredNodes, edges, collapsed),
    [filteredNodes, edges, collapsed]
  )

  const peerSummary = useMemo(() => {
    const selected = nodes.find((node) => node.ID == selectedID)
    if (selected?.Kind == 'endpoint') {
      const clients = nodes
        .filter(
          (node) =>
            node.Kind == 'device' &&
            !isIsolated(node) &&
            node.Tags?.some((tag) => selected.Tags?.includes(tag))
        )
        .map((node) => ({ ID: node.ID, Name: displayName(node) }))
      return { endpointClients: clients }
    }
    if (selected?.Kind != 'device') return null
    if (isIsolated(selected)) {
      return { isolated: true, canReach: [], reachableFrom: [], endpoints: [] }
    }
    const others = nodes.filter(
      (node) =>
        node.Kind == 'device' && node.ID != selected.ID && !isIsolated(node)
    )
    const sharesGroup = (node) =>
      node.Groups?.some((group) => selected.Groups?.includes(group))
    const canReach = others
      .filter((node) => sharesGroup(node) || selected.Policies?.includes('lan'))
      .map((node) => node.ID)
    const reachableFrom = others
      .filter((node) => sharesGroup(node) || node.Policies?.includes('lan'))
      .map((node) => node.ID)
    const endpoints = nodes
      .filter(
        (node) =>
          node.Kind == 'endpoint' &&
          node.Tags?.some((tag) => selected.Tags?.includes(tag))
      )
      .map((node) => ({
        ID: node.ID,
        Name: node.Name,
        IP: node.IP,
        Via: node.Tags?.filter((tag) => selected.Tags?.includes(tag)) || []
      }))
    return { isolated: false, canReach, reachableFrom, endpoints }
  }, [nodes, selectedID])

  const allowedPeers = useMemo(
    () =>
      peerSummary
        ? [
            ...new Set([
              ...(peerSummary.canReach || []),
              ...(peerSummary.reachableFrom || []),
              ...(peerSummary.endpoints || []).map((e) => e.ID),
              ...(peerSummary.endpointClients || []).map((c) => c.ID)
            ])
          ]
        : [],
    [peerSummary]
  )

  const fitView = () => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width < 100 || rect.height < 100) {
      requestAnimationFrame(fitView)
      return
    }
    const minScale = compact ? 0.6 : 0.25
    const k = Math.min(
      1,
      Math.max(
        minScale,
        Math.min(
          (rect.width - 40) / layout.width,
          (rect.height - 40) / layout.height
        )
      )
    )
    let x = (rect.width - layout.width * k) / 2
    let y = Math.max((rect.height - layout.height * k) / 2, 20)
    const router = layout.positions['router']
    if (router && layout.width * k > rect.width) {
      x = rect.width * 0.15 - router.x * k
    }
    if (router && layout.height * k > rect.height) {
      y = rect.height / 2 - router.y * k
    }
    setView({ x, y, k })
  }

  useEffect(() => {
    if (topology && !fittedRef.current) {
      fittedRef.current = true
      requestAnimationFrame(fitView)
    }
  }, [topology])

  const zoom = (factor, cx, cy) => {
    setView((current) => {
      const k = Math.min(2.5, Math.max(0.25, current.k * factor))
      const container = containerRef.current?.getBoundingClientRect()
      const px = cx ?? (container?.width || 0) / 2
      const py = cy ?? (container?.height || 0) / 2
      return {
        x: px - ((px - current.x) * k) / current.k,
        y: py - ((py - current.y) * k) / current.k,
        k
      }
    })
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (event) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      zoom(
        event.deltaY < 0 ? 1.12 : 0.89,
        event.clientX - rect.left,
        event.clientY - rect.top
      )
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [topology ? true : false])

  const onMouseDown = (event) => {
    movedRef.current = false
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y
    }
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }

  const onMouseMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }))
  }

  const onMouseUp = (event) => {
    const drag = dragRef.current
    dragRef.current = null
    if (containerRef.current) containerRef.current.style.cursor = 'grab'
    const onCanvas =
      event.target?.tagName == 'svg' ||
      event.target === containerRef.current ||
      event.target?.parentElement === containerRef.current
    if (drag && !movedRef.current && onCanvas) {
      setSelectedID(null)
      setSelectedLinkID(null)
    }
  }

  const connectFromRef = useRef(null)
  connectFromRef.current = connectFrom

  const selectNode = useCallback((node) => {
    if (movedRef.current) return
    const from = connectFromRef.current
    if (from && node.ID != from.ID) {
      if (node.Kind == 'device') {
        setConnectTarget(node)
        setConnectChoice('')
        return
      }
      if (node.Kind == 'endpoint') {
        setConnectTarget(node)
        setConnectChoice(node.Tags?.[0] || '')
        return
      }
    }
    setSelectedLinkID(null)
    setSelectedID(node.ID)
  }, [])

  const selectLink = (link) => {
    setSelectedID(null)
    setSelectedLinkID(link.id)
  }

  const deviceIdentity = (node) => node.MAC || node.ID?.replace(/^dev:/, '')

  const updateDevice = (identity, data) => {
    deviceAPI
      .update(identity, data)
      .then(() => refresh())
      .catch((error) => context.error('Failed to update device', error))
  }

  const clearConnect = () => {
    setConnectFrom(null)
    setConnectTarget(null)
    setConnectChoice('')
  }

  const applyConnect = () => {
    const choice = connectChoice.trim()
    if (!choice || !connectFrom || !connectTarget) return

    const finish = () => {
      setMode('policy')
      setSelectedID(connectFrom.ID)
      refresh()
    }

    if (connectTarget.Kind == 'endpoint') {
      deviceAPI
        .updateTags(deviceIdentity(connectFrom), [
          ...new Set([...(connectFrom.Tags || []), choice])
        ])
        .then(finish)
        .catch((error) => context.error('Failed to connect device', error))
    } else {
      Promise.all(
        [connectFrom, connectTarget].map((node) =>
          deviceAPI.updateGroups(deviceIdentity(node), [
            ...new Set([...(node.Groups || []), choice])
          ])
        )
      )
        .then(finish)
        .catch((error) => context.error('Failed to connect devices', error))
    }
    clearConnect()
  }

  const touchPoint = (touch) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }

  const onTouchStart = (event) => {
    if (event.touches.length == 1) {
      const touch = event.touches[0]
      movedRef.current = false
      pinchRef.current = null
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        viewX: view.x,
        viewY: view.y
      }
    } else if (event.touches.length == 2) {
      dragRef.current = null
      movedRef.current = true
      const [a, b] = [event.touches[0], event.touches[1]]
      const pa = touchPoint(a)
      const pb = touchPoint(b)
      pinchRef.current = {
        dist: Math.hypot(pa.x - pb.x, pa.y - pb.y),
        mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
        base: view
      }
    }
  }

  const onTouchMove = (event) => {
    if (pinchRef.current && event.touches.length == 2) {
      const [a, b] = [event.touches[0], event.touches[1]]
      const pa = touchPoint(a)
      const pb = touchPoint(b)
      const { dist, mid, base } = pinchRef.current
      const k = Math.min(2.5, Math.max(0.25, (base.k * Math.hypot(pa.x - pb.x, pa.y - pb.y)) / dist))
      const newMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
      setView({
        x: newMid.x - ((mid.x - base.x) * k) / base.k,
        y: newMid.y - ((mid.y - base.y) * k) / base.k,
        k
      })
      return
    }
    const drag = dragRef.current
    if (!drag || !event.touches.length) return
    const touch = event.touches[0]
    const dx = touch.clientX - drag.startX
    const dy = touch.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }))
  }

  const onTouchEnd = (event) => {
    if (!event.touches.length) {
      dragRef.current = null
      pinchRef.current = null
    }
  }

  const toggleCollapse = (id) => {
    setCollapsed((current) =>
      current.includes(id)
        ? current.filter((entry) => entry != id)
        : [...current, id]
    )
  }

  const { positions, visible, junctions, parentOf, byID, uplinks } = layout

  const physicalLinks = useMemo(() => {
    const junctionByParent = Object.fromEntries(
      junctions.filter((j) => !j.collapsed).map((j) => [j.id, j])
    )
    const links = []

    visible.forEach((id) => {
      if (id == 'router' || uplinks.includes(id)) return
      const parent = parentOf[id]
      if (!parent || !positions[parent] || !positions[id]) return

      const node = byID[id]
      const junction = junctionByParent[parent]
      const from = junction || {
        x: positions[parent].x + NODE_ANCHOR,
        y: positions[parent].y
      }
      links.push({
        id: `${parent}>${id}`,
        layer: 'l1',
        a: parent,
        b: id,
        node,
        path: linkPath(
          from.x,
          from.y,
          positions[id].x - NODE_ANCHOR,
          positions[id].y
        ),
        onPath:
          selectedID &&
          (id == selectedID ||
            (parentChain(selectedID, parentOf).includes(id) &&
              mode == 'physical'))
      })
    })

    uplinks.forEach((id) => {
      if (!positions[id] || !positions['router']) return
      links.push({
        id: `${id}>router`,
        layer: 'l1',
        a: 'router',
        b: id,
        node: byID[id],
        path: linkPath(
          positions[id].x + NODE_ANCHOR,
          positions[id].y,
          positions['router'].x - NODE_ANCHOR,
          positions['router'].y
        ),
        onPath: false
      })
    })

    junctions.forEach((j) => {
      links.push({
        id: `${j.id}>junction`,
        node: byID[j.id],
        straight: true,
        path: `M ${positions[j.id].x + NODE_ANCHOR} ${positions[j.id].y} L ${
          j.x
        } ${j.y}`,
        onPath: false
      })
    })

    return links
  }, [visible, positions, junctions, parentOf, byID, uplinks, selectedID, mode])

  const policyLinks = useMemo(() => {
    if (mode != 'policy') return []
    const litIDs = selectedID ? new Set([selectedID, ...allowedPeers]) : null
    return edges
      .filter(
        (edge) =>
          edge.Layer == 'policy' &&
          positions[edge.From] &&
          positions[edge.To] &&
          visible.has(edge.From) &&
          visible.has(edge.To)
      )
      .map((edge, index) => {
        const from = positions[edge.From]
        const to = positions[edge.To]
        const wan = edge.Kind == 'policy:wan'
        const sameColumn = Math.abs(to.x - from.x) < COL_WIDTH / 2
        let path
        let arrow = edge.Bidir ? null : 'end'
        if (wan) {
          path = linkPath(to.x + NODE_ANCHOR, to.y, from.x - NODE_ANCHOR, from.y)
          arrow = 'start'
        } else if (sameColumn) {
          path = arcPath(from.x + NODE_ANCHOR, from.y, to.x + NODE_ANCHOR, to.y)
        } else {
          const [left, right] = from.x < to.x ? [from, to] : [to, from]
          path = linkPath(
            left.x + NODE_ANCHOR,
            left.y,
            right.x - NODE_ANCHOR,
            right.y
          )
          if (!edge.Bidir) {
            arrow = to.x > from.x ? 'end' : 'start'
          }
        }
        return {
          id: `${edge.From}>${edge.To}>${index}`,
          layer: 'policy',
          a: edge.From,
          b: edge.To,
          kind: edge.Kind,
          bidir: !!edge.Bidir,
          endpoint: edge.Kind.startsWith('endpoint:'),
          group: edge.Kind.startsWith('group:'),
          arrow: edge.Bidir ? null : arrow,
          highlighted:
            selectedID && (edge.From == selectedID || edge.To == selectedID),
          peerLit:
            litIDs && litIDs.has(edge.From) && litIDs.has(edge.To),
          path
        }
      })
  }, [edges, positions, visible, mode, selectedID, allowedPeers])

  const selectedLink = useMemo(
    () =>
      selectedLinkID
        ? [...physicalLinks, ...policyLinks].find(
            (link) => link.id == selectedLinkID
          ) || null
        : null,
    [selectedLinkID, physicalLinks, policyLinks]
  )

  const summary = useMemo(() => {
    const devices = nodes.filter((node) => node.Kind == 'device')
    return {
      total: devices.length,
      online: devices.filter((node) => node.Online).length,
      isolated: devices.filter(isIsolated).length,
      leaves: nodes.filter((node) => node.Kind == 'leaf_router').length,
      shown: filteredNodes.filter((node) => node.Kind == 'device').length
    }
  }, [nodes, filteredNodes])

  const selectedNode = nodes.find((node) => node.ID == selectedID)

  const isDimmed = (node) => {
    if (mode != 'policy') return false
    if (['router', 'ap_radio', 'port', 'vpn', 'leaf_router'].includes(node.Kind)) {
      return true
    }
    if (!selectedID || node.ID == selectedID) return false
    if (selectedNode?.Kind != 'device' && selectedNode?.Kind != 'endpoint') {
      return false
    }
    if (node.Kind != 'device' && node.Kind != 'endpoint') return false
    return !allowedPeers.includes(node.ID)
  }

  if (!topology) {
    return (
      <Box
        alignItems="center"
        justifyContent="center"
        style={{ height: '92vh' }}
      >
        <Spinner size="large" />
      </Box>
    )
  }

  return (
    <Box
      overflow="hidden"
      style={{
        height: '92vh',
        position: 'relative',
        backgroundColor: palette.canvas
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'grab',
          overflow: 'hidden',
          touchAction: 'none'
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          style={{
            position: 'absolute',
            transformOrigin: '0 0',
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            width: layout.width,
            height: layout.height
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            style={{ position: 'absolute', overflow: 'visible' }}
          >
            <style>
              {'@keyframes topoDash { to { stroke-dashoffset: -24; } }'}
            </style>
            <defs>
              <marker
                id="topoArrowPolicy"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill={palette.policy} />
              </marker>
              <marker
                id="topoArrowEndpoint"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill={palette.endpoint} />
              </marker>
            </defs>
            {physicalLinks.map((link) => {
              const dash = link.straight ? null : edgeDash(link.node)
              const live =
                dash && link.node?.Online && link.node?.ConnType != 'offline'
              const linkSelected = link.id == selectedLinkID
              return (
                <path
                  key={link.id}
                  d={link.path}
                  fill="none"
                  stroke={
                    linkSelected
                      ? palette.selected
                      : link.node?.ConnType == 'offline'
                        ? palette.linkMuted
                        : mode == 'policy'
                          ? palette.linkDim
                          : link.onPath
                            ? palette.selected
                            : palette.link
                  }
                  strokeWidth={link.onPath || linkSelected ? 2.4 : 1.6}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  style={
                    live && mode == 'physical'
                      ? { animation: 'topoDash 1.4s linear infinite' }
                      : null
                  }
                />
              )
            })}

            {policyLinks.map((link) => {
              const marker = link.endpoint
                ? 'url(#topoArrowEndpoint)'
                : 'url(#topoArrowPolicy)'
              return (
                <path
                  key={link.id}
                  d={link.path}
                  fill="none"
                  stroke={
                    link.endpoint
                      ? palette.endpoint
                      : link.group
                        ? palette.group
                        : palette.policy
                  }
                  opacity={
                    link.highlighted
                      ? 1
                      : link.peerLit
                        ? 0.9
                        : !selectedID
                          ? 0.55
                          : 0.12
                  }
                  strokeWidth={
                    link.highlighted || link.id == selectedLinkID ? 2 : 1.25
                  }
                  strokeLinecap="round"
                  markerEnd={link.arrow == 'end' ? marker : null}
                  markerStart={link.arrow == 'start' ? marker : null}
                />
              )
            })}

            {[...physicalLinks, ...policyLinks]
              .filter((link) => !link.straight)
              .map((link) => (
                <path
                  key={`hit:${link.id}`}
                  d={link.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  pointerEvents="stroke"
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectLink(link)}
                />
              ))}

            {junctions.map((junction) => (
              <g
                key={junction.id}
                opacity={mode == 'policy' ? 0.25 : 1}
                onClick={() => toggleCollapse(junction.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={junction.x}
                  cy={junction.y}
                  r={junction.collapsed ? 11 : 9}
                  fill={palette.junctionFill}
                />
                <text
                  x={junction.x}
                  y={junction.y + 3.5}
                  textAnchor="middle"
                  fontSize={junction.collapsed ? 9 : 11}
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                  fill={palette.junctionText}
                  style={{ userSelect: 'none' }}
                >
                  {junction.collapsed ? `+${junction.count}` : '−'}
                </text>
              </g>
            ))}
          </svg>

          {[...visible]
            .filter((id) => byID[id] && positions[id])
            .filter((id) => mode == 'policy' || byID[id].Kind != 'endpoint')
            .map((id) => (
              <TopologyNode
                key={id}
                node={byID[id]}
                position={positions[id]}
                palette={palette}
                selected={id == selectedID}
                dimmed={isDimmed(byID[id])}
                onPress={selectNode}
              />
            ))}
        </div>
      </div>

      <HStack
        position="absolute"
        top={16}
        left={16}
        space="sm"
        alignItems="center"
      >
        <HStack
          borderRadius={8}
          borderWidth={1}
          borderColor="$muted200"
          sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
          bg="$backgroundCardLight"
          p="$0.5"
        >
          {['physical', 'policy'].map((entry) => (
            <Button
              key={entry}
              size="xs"
              variant={mode == entry ? 'solid' : 'link'}
              action={mode == entry ? 'primary' : 'secondary'}
              onPress={() => setMode(entry)}
              px="$3"
            >
              <ButtonText>
                {entry == 'physical' ? 'Physical' : 'Policy'}
              </ButtonText>
            </Button>
          ))}
        </HStack>

        <div data-topo-filter="1">
          <Button
            size="xs"
            variant={filterActive ? 'solid' : 'outline'}
            action={filterActive ? 'primary' : 'secondary'}
            onPress={() => setFilterOpen((current) => !current)}
          >
            <ButtonIcon as={FunnelIcon} />
            {filterActive ? (
              <ButtonText ml="$1">
                {deviceFilter.groups.length +
                  deviceFilter.tags.length +
                  deviceFilter.policies.length +
                  deviceFilter.classifications.length}
              </ButtonText>
            ) : null}
          </Button>
        </div>
        {compact ? null : (
          <>
            <Button size="xs" variant="outline" action="secondary" onPress={() => zoom(1.2)}>
              <ButtonIcon as={ZoomInIcon} />
            </Button>
            <Button size="xs" variant="outline" action="secondary" onPress={() => zoom(0.83)}>
              <ButtonIcon as={ZoomOutIcon} />
            </Button>
          </>
        )}
        <Button size="xs" variant="outline" action="secondary" onPress={fitView}>
          <ButtonIcon as={MaximizeIcon} />
        </Button>
        <Button size="xs" variant="outline" action="secondary" onPress={refresh}>
          <ButtonIcon as={RefreshCwIcon} />
        </Button>
      </HStack>

      <HStack
        position="absolute"
        top={compact ? 60 : 16}
        right={16}
        {...(!compact && selectedNode ? { right: 332 } : {})}
        borderRadius={8}
        borderWidth={1}
        borderColor="$muted200"
        sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
        bg="$backgroundCardLight"
        px="$3"
        py="$1.5"
        space="md"
      >
        <Text size="xs" color="$muted500">
          {summary.online}/{summary.total} online
          {filterActive ? ` · ${summary.shown} shown` : ''}
        </Text>
        {summary.isolated ? (
          <Text size="xs" color="$red500">
            {summary.isolated} quarantined
          </Text>
        ) : null}
        {summary.leaves ? (
          <Text size="xs" color="$muted500">
            {summary.leaves} mesh
          </Text>
        ) : null}
      </HStack>

      <VStack
        position="absolute"
        bottom={16}
        left={16}
        display={compact && selectedNode ? 'none' : 'flex'}
        borderRadius={8}
        borderWidth={1}
        borderColor="$muted200"
        sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
        bg="$backgroundCardLight"
        px="$3"
        py="$2"
        space="xs"
      >
        <LegendRow palette={palette} label="Wired" />
        <LegendRow palette={palette} dash="6 6" label="WiFi" />
        <LegendRow palette={palette} dash="2 6" label="WireGuard" />
        {mode == 'policy' ? (
          <>
            <LegendRow palette={palette} color={palette.group} label="Group (two-way)" />
            <LegendRow palette={palette} color={palette.policy} arrow label="lan / wan (one-way)" />
            <LegendRow palette={palette} color={palette.endpoint} arrow label="Endpoint access" />
          </>
        ) : null}
        <LegendRow palette={palette} ring label="Isolated" />
      </VStack>

      {filterOpen ? (
        <div data-topo-filter="1">
          <FilterPanel
            options={filterOptions}
            filter={deviceFilter}
            onToggle={toggleFilter}
            onClear={() => {
              setDeviceFilter({
                groups: [],
                tags: [],
                policies: [],
                classifications: []
              })
              setFilterOpen(false)
            }}
          />
        </div>
      ) : null}

      {connectFrom && !connectTarget ? (
        <HStack
          position="absolute"
          top={16}
          left="50%"
          style={{ transform: 'translateX(-50%)' }}
          borderRadius={8}
          borderWidth={1}
          borderColor="$primary400"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          bg="$backgroundCardLight"
          px="$3"
          py="$1.5"
          space="md"
          alignItems="center"
        >
          <Icon as={LinkIcon} color="$primary500" size={14} />
          <Text size="xs">
            Select a device or endpoint to connect with {displayName(connectFrom)}
          </Text>
          <Button size="xs" variant="link" action="secondary" onPress={clearConnect}>
            <ButtonText>Cancel</ButtonText>
          </Button>
        </HStack>
      ) : null}

      {connectTarget ? (
        <Box
          position="absolute"
          top="30%"
          left="50%"
          w={300}
          style={{ transform: 'translateX(-50%)' }}
          borderRadius={12}
          borderWidth={1}
          borderColor="$muted200"
          sx={{ _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } }}
          bg="$backgroundCardLight"
          p="$4"
        >
          <VStack space="md">
            <Heading size="xs">
              Connect {displayName(connectFrom)}{' '}
              {connectTarget.Kind == 'endpoint' ? '→' : '↔'}{' '}
              {displayName(connectTarget)}
            </Heading>
            <Text size="xs" color="$muted500">
              {connectTarget.Kind == 'endpoint'
                ? 'The device gets a tag this endpoint accepts, granting one-way access to it.'
                : 'Both devices join a group, granting two-way connectivity.'}
            </Text>
            <HStack space="xs" flexWrap="wrap">
              {(connectTarget.Kind == 'endpoint'
                ? connectTarget.Tags || []
                : filterOptions.groups
              ).map((choice) => (
                <Pressable key={choice} onPress={() => setConnectChoice(choice)} mb="$1">
                  <Badge
                    action={connectChoice == choice ? 'success' : 'muted'}
                    variant={connectChoice == choice ? 'solid' : 'outline'}
                  >
                    <BadgeText>{choice}</BadgeText>
                  </Badge>
                </Pressable>
              ))}
            </HStack>
            {connectTarget.Kind == 'endpoint' ? null : (
              <Input size="sm">
                <InputField
                  value={connectChoice}
                  placeholder="group name"
                  onChangeText={setConnectChoice}
                  onSubmitEditing={applyConnect}
                />
              </Input>
            )}
            <HStack space="sm">
              <Button
                size="xs"
                action="primary"
                flex={1}
                isDisabled={!connectChoice.trim()}
                onPress={applyConnect}
              >
                <ButtonText>Connect</ButtonText>
              </Button>
              <Button size="xs" variant="outline" action="secondary" onPress={clearConnect}>
                <ButtonText>Cancel</ButtonText>
              </Button>
            </HStack>
          </VStack>
        </Box>
      ) : null}

      {selectedLink && !selectedNode ? (
        <LinkPanel
          link={selectedLink}
          byID={byID}
          compact={compact}
          onClose={() => setSelectedLinkID(null)}
        />
      ) : null}

      {selectedNode ? (
        <DetailPanel
          node={selectedNode}
          peers={peerSummary}
          classification={classifications[selectedNode.MAC?.toLowerCase()]}
          options={filterOptions}
          compact={compact}
          onEdit={(identity) =>
            navigate(`/admin/devices/${encodeURIComponent(identity)}`)
          }
          onClose={() => setSelectedID(null)}
          onUpdateDevice={updateDevice}
          onConnect={(node) => {
            setConnectFrom(node)
            setSelectedID(null)
            setMode('policy')
          }}
        />
      ) : null}
    </Box>
  )
}

const parentChain = (id, parentOf) => {
  const chain = []
  let current = parentOf[id]
  while (current) {
    chain.push(current)
    current = parentOf[current]
  }
  return chain
}

export default Topology
