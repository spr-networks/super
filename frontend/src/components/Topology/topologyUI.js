import React, { useContext, useState } from 'react'
import { Platform } from 'react-native'
import { AppContext } from 'AppContext'

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
  Text,
  VStack
} from '@gluestack-ui/themed'

import {
  ActivityIcon,
  BanIcon,
  BlocksIcon,
  CableIcon,
  CheckIcon,
  EarthLockIcon,
  GlobeIcon,
  LinkIcon,
  RouterIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  TagIcon,
  TargetIcon,
  TrashIcon,
  UsersIcon,
  WaypointsIcon,
  WifiIcon
} from 'lucide-react-native'

import { prettyDate } from 'utils'
import IconItem from 'components/IconItem'
import { IconsList } from 'components/IconPicker'
import { GroupItem, PolicyItem, TagItem } from 'components/TagItem'
import {
  displayName,
  isIsolated,
  signalColor
} from 'components/Topology/topologyLayout'

export const PALETTE = {
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

export const INFRA_ICONS = {
  router: RouterIcon,
  uplink: GlobeIcon,
  ap_radio: WifiIcon,
  port: CableIcon,
  vpn: EarthLockIcon,
  leaf_router: RouterIcon,
  endpoint: TargetIcon,
  extension: BlocksIcon,
  sink: WaypointsIcon
}

//web renders CSS box shadows; native gets platform shadow props
export const cardShadow =
  Platform.OS == 'web'
    ? { boxShadow: '0 8px 30px rgba(2, 8, 20, 0.35)' }
    : {
        shadowColor: '#020814',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10
      }

const nodeShadow = (palette, selected) => {
  if (Platform.OS == 'web') {
    return selected
      ? { boxShadow: `0 0 14px ${palette.selected}66` }
      : { boxShadow: '0 2px 8px rgba(2, 8, 20, 0.25)' }
  }
  return {
    shadowColor: selected ? palette.selected : '#020814',
    shadowOpacity: selected ? 0.6 : 0.25,
    shadowRadius: selected ? 7 : 4,
    shadowOffset: { width: 0, height: selected ? 0 : 2 },
    elevation: 4
  }
}

export const nodeTitle = (node) => {
  if (node.Kind == 'uplink') return `Internet (${node.Name})`
  return displayName(node)
}

export const nodeSubtitle = (node) => {
  if (node.Kind == 'device') return node.IP || (node.Online ? '' : 'offline')
  if (node.Kind == 'leaf_router' || node.Kind == 'endpoint') return node.IP
  if (node.Kind == 'ap_radio' || node.Kind == 'port') {
    return node.Iface != node.Name ? node.Iface : ''
  }
  if (node.Kind == 'sink') {
    return node.Iface != node.Name ? node.Iface : ''
  }
  return ''
}

export const edgeDash = (node) => {
  if (!node) return null
  if (node.Kind == 'ap_radio') return null
  if (node.Kind == 'vpn' || node.ConnType == 'wireguard') return '2 6'
  if (node.ConnType == 'wifi') return '6 6'
  if (node.ConnType == 'offline') return '3 6'
  return null
}

export const parentChain = (id, parentOf) => {
  const chain = []
  let current = parentOf[id]
  while (current) {
    chain.push(current)
    current = parentOf[current]
  }
  return chain
}

export const TopologyNode = React.memo(
  ({ node, position, palette, selected, dimmed, onPress }) => {
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
          style={nodeShadow(palette, selected)}
        >
          {isDevice ? (
            <IconItem
              name={node.Style?.Icon || 'Laptop'}
              color={
                offline
                  ? palette.sublabel
                  : node.Style?.Color
                    ? `$${node.Style.Color}400`
                    : palette.icon
              }
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
          color={
            isolated ? '$red500' : selected ? '$primary500' : '$textLight900'
          }
          sx={isolated || selected ? {} : { _dark: { color: '$textDark100' } }}
        >
          {nodeTitle(node)}
        </Text>
        <Box
          mt={3}
          w={26}
          h={1}
          opacity={0.4}
          bg={isolated ? '$red500' : '$muted400'}
          sx={isolated ? {} : { _dark: { bg: '$muted600' } }}
        />
        {nodeSubtitle(node) ? (
          <Text size="2xs" mt="$0.5" numberOfLines={1} color="$muted500">
            {nodeSubtitle(node)}
          </Text>
        ) : null}
      </Pressable>
    )
  }
)

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

const EditablePills = ({ title, values, addOptions, allowAdd = true, onChange }) => {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  //show only assigned values; toggled-off ones stay gray for this view
  const [removed, setRemoved] = useState([])
  const all = [...new Set([...(values || []), ...removed])].sort()

  const toggle = (name) => {
    if (values?.includes(name)) {
      setRemoved((current) => [...new Set([...current, name])])
      onChange(values.filter((entry) => entry != name))
    } else {
      setRemoved((current) => current.filter((entry) => entry != name))
      onChange([...(values || []), name])
    }
  }

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
          addOptions ? (
            addOptions
              .filter((name) => !all.includes(name))
              .map((name) => (
                <Pressable
                  key={'add:' + name}
                  onPress={() => {
                    onChange([...(values || []), name])
                    setAdding(false)
                  }}
                  mb="$1"
                >
                  <Badge action="muted" variant="outline">
                    <BadgeText>{name}</BadgeText>
                  </Badge>
                </Pressable>
              ))
          ) : (
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
          )
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
  SSID: 'SSID',
  Iface: 'Interface',
  ConnType: 'Connection'
}

const PeerList = ({ label, peers, onSelectPeer }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <VStack space="xs">
      <Pressable onPress={() => peers.length && setExpanded(!expanded)}>
        <Text size="sm">
          {label}: {peers.length} device{peers.length == 1 ? '' : 's'}
          {peers.length ? (expanded ? ' ▾' : ' ▸') : ''}
        </Text>
      </Pressable>
      {expanded ? (
        <HStack space="xs" flexWrap="wrap">
          {peers.map((peer) => (
            <Pressable key={peer.ID} onPress={() => onSelectPeer(peer.ID)} mb="$1">
              <Badge action="muted" variant="outline">
                <BadgeText>{peer.Name}</BadgeText>
              </Badge>
            </Pressable>
          ))}
        </HStack>
      ) : null}
    </VStack>
  )
}

const STYLE_COLORS = [
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'red',
  'tertiary',
  'teal',
  'cyan',
  'blueGray',
  'amber',
  'orange'
]

export const StyleEditor = ({ initialIcon, initialColor, onChange }) => {
  const [icon, setIcon] = useState(initialIcon)
  const [color, setColor] = useState(initialColor)

  const apply = (nextIcon, nextColor) => {
    setIcon(nextIcon)
    setColor(nextColor)
    onChange({ Icon: nextIcon, Color: nextColor })
  }

  return (
    <VStack space="md">
      <Text size="xs" color="$muted500">
        Changes apply immediately
      </Text>
      <HStack space="sm" flexWrap="wrap">
        {STYLE_COLORS.map((name) => (
          <Pressable key={name} onPress={() => apply(icon, name)} mb="$1">
            <Box
              w={28}
              h={28}
              borderRadius={6}
              bg={`$${name}400`}
              borderWidth={2}
              borderColor={color == name ? '$primary500' : 'transparent'}
              opacity={color == name ? 1 : 0.6}
            />
          </Pressable>
        ))}
      </HStack>
      <IconsList
        selected={icon}
        setSelected={(name) => apply(name, color)}
        color={color}
      />
    </VStack>
  )
}

// route a device's outbound traffic to an advertised sink: pick a sink, scope
// the rule with a CIDR + optional port, optionally rewrite plaintext DNS
const RouteSinkSection = ({ sinks, routes, onAdd, onRemoveRoute }) => {
  const appContext = useContext(AppContext)
  const [sinkID, setSinkID] = useState(null)
  const [cidr, setCidr] = useState('0.0.0.0/0')
  const [port, setPort] = useState('')
  const [dns, setDns] = useState('')

  const sink = sinks.find((s) => s.ID == sinkID)

  if (appContext.isPlusDisabled) {
    return null
  }

  return (
    <VStack space="xs">
      {routes?.length ? (
        <VStack space="xs">
          <Text size="xs" color="$muted500">
            Current routes
          </Text>
          {routes.map(({ rule, index }) => (
            <HStack
              key={index}
              space="sm"
              alignItems="center"
              justifyContent="space-between"
            >
              <VStack flex={1}>
                <Text size="xs" numberOfLines={1}>
                  {rule.RuleName || 'Route'}
                </Text>
                <Text size="2xs" color="$muted500" numberOfLines={1}>
                  {[rule.Dst?.IP, rule.DstInterface].filter(Boolean).join(' · ')}
                </Text>
              </VStack>
              <Button
                size="xs"
                variant="link"
                action="secondary"
                onPress={() => onRemoveRoute(index)}
              >
                <ButtonIcon as={TrashIcon} color="$red700" />
              </Button>
            </HStack>
          ))}
        </VStack>
      ) : null}
      <Text size="xs" color="$muted500">
        Route outbound via
      </Text>
      <HStack space="xs" flexWrap="wrap">
        {sinks.map((s) => (
          <Pressable
            key={s.ID}
            onPress={() => setSinkID(s.ID == sinkID ? null : s.ID)}
          >
            <Badge
              action={s.ID == sinkID ? 'info' : s.Online ? 'success' : 'muted'}
              variant={s.ID == sinkID ? 'solid' : 'outline'}
              mb="$1"
            >
              <BadgeText>{s.Name}</BadgeText>
            </Badge>
          </Pressable>
        ))}
      </HStack>
      {sink ? (
        <VStack space="xs">
          <Input size="sm" variant="outline">
            <InputField
              value={cidr}
              onChangeText={setCidr}
              placeholder="CIDR (0.0.0.0/0 = all traffic)"
            />
          </Input>
          <Input size="sm" variant="outline">
            <InputField
              value={port}
              onChangeText={setPort}
              placeholder="Port or range (optional, ex: 53)"
            />
          </Input>
          <Input size="sm" variant="outline">
            <InputField
              value={dns}
              onChangeText={setDns}
              placeholder="Rewrite plaintext DNS to IP (optional)"
            />
          </Input>
          <Button
            size="xs"
            action="primary"
            variant="outline"
            isDisabled={!cidr.trim()}
            onPress={() =>
              onAdd(sink, {
                cidr: cidr.trim(),
                port: port.trim(),
                dns: dns.trim()
              })
            }
          >
            <ButtonIcon as={WaypointsIcon} mr="$1" />
            <ButtonText>Add route</ButtonText>
          </Button>
        </VStack>
      ) : null}
    </VStack>
  )
}

export const DetailPanel = ({
  node,
  peers,
  classification,
  options,
  compact,
  onEdit,
  onEditStyle,
  onClose,
  onUpdateDevice,
  onConnect,
  onSelectPeer,
  sinks,
  onAddRoute,
  routes,
  onRemoveRoute
}) => {
  const fields = ['IP', 'TinyNet', 'VLANTag', 'MAC', 'SSID', 'Iface', 'ConnType'].filter(
    (field) => node[field]
  )
  const identity = node.MAC || node.ID?.replace(/^dev:/, '')
  const editable = node.Kind == 'device' && identity
  const deviceRoutes = (routes || [])
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => node.IP && rule.Client?.SrcIP == node.IP)

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
      style={cardShadow}
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

          {node.DHCPFirstTime ? (
            <HStack justifyContent="space-between" space="md">
              <Text size="xs" color="$muted500">
                First DHCP
              </Text>
              <Text size="xs">{prettyDate(node.DHCPFirstTime)}</Text>
            </HStack>
          ) : null}
          {node.DHCPLastTime ? (
            <HStack justifyContent="space-between" space="md">
              <Text size="xs" color="$muted500">
                Last DHCP
              </Text>
              <Text size="xs">{prettyDate(node.DHCPLastTime)}</Text>
            </HStack>
          ) : null}

          {node.Radio
            ? radioRows(node.Radio).map((row) => (
                <HStack key={row.label} justifyContent="space-between" space="md">
                  <Text size="xs" color="$muted500">
                    {row.label}
                  </Text>
                  <Text size="xs" maxWidth={170} textAlign="right">
                    {row.value}
                  </Text>
                </HStack>
              ))
            : null}

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
                key={node.ID + ':policies'}
                title="Policies"
                values={node.Policies}
                addOptions={EDITABLE_POLICIES}
                onChange={(next) => onUpdateDevice(identity, { Policies: next })}
              />
              <EditablePills
                key={node.ID + ':groups'}
                title="Groups"
                values={node.Groups}
                onChange={(next) => onUpdateDevice(identity, { Groups: next })}
              />
              <EditablePills
                key={node.ID + ':tags'}
                title="Tags"
                values={node.Tags}
                onChange={(next) => onUpdateDevice(identity, { DeviceTags: next })}
              />
              <VStack space="xs">
                <Text size="xs" color="$muted500">
                  Icon
                </Text>
                <HStack space="md" alignItems="center">
                  <IconItem
                    name={node.Style?.Icon || 'Laptop'}
                    color={`$${node.Style?.Color || 'blueGray'}400`}
                    size={28}
                  />
                  <Button
                    size="xs"
                    action="secondary"
                    variant="outline"
                    onPress={() => onEditStyle(node)}
                  >
                    <ButtonText>Change...</ButtonText>
                  </Button>
                </HStack>
              </VStack>
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
                  <PeerList
                    label="Can connect to"
                    peers={peers.canReach}
                    onSelectPeer={onSelectPeer}
                  />
                  <PeerList
                    label="Reachable from"
                    peers={peers.reachableFrom}
                    onSelectPeer={onSelectPeer}
                  />
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

          {editable && sinks?.length && onAddRoute ? (
            <RouteSinkSection
              sinks={sinks}
              routes={deviceRoutes}
              onAdd={(sink, scope) => onAddRoute(node, sink, scope)}
              onRemoveRoute={onRemoveRoute}
            />
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

export const linkPanelInfo = (link, byID) => {
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
    } else if (kind == 'route' || kind.startsWith('route:')) {
      type =
        kind == 'route:dns'
          ? 'Routed DNS (one-way)'
          : kind == 'route:split'
            ? 'Routed subnet (one-way)'
            : 'Routed traffic (one-way)'
      if (b.Iface) rows.push({ label: 'Interface', value: b.Iface })
      if (b.IP) rows.push({ label: 'Via', value: b.IP })
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
    if (radio.Radio?.Freq) {
      rows.push({
        label: 'Band',
        value: `${bandFromFreq(radio.Radio.Freq)} · ch ${radio.Radio.Channel}`
      })
    }
    if (device.Signal?.Caps?.length) {
      rows.push({
        label: 'Capabilities',
        value: `${stationGeneration(device.Signal.Caps)} (${device.Signal.Caps.join(', ')})`
      })
    }
  } else if (radio) {
    type = 'WiFi radio'
    if (radio.SSID) rows.push({ label: 'SSID', value: radio.SSID })
    rows.push(...radioRows(radio.Radio))
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

export const LinkPanel = ({ link, byID, compact, onClose }) => {
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
      style={cardShadow}
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

export const bandFromFreq = (freq) => {
  if (!freq) return ''
  if (freq >= 5925) return '6 GHz'
  if (freq >= 5150) return '5 GHz'
  return '2.4 GHz'
}

const WIFI_GEN = { be: 'Wi-Fi 7', ax: 'Wi-Fi 6', ac: 'Wi-Fi 5', n: 'Wi-Fi 4' }
const CAP_GEN = { EHT: 'Wi-Fi 7', HE: 'Wi-Fi 6', VHT: 'Wi-Fi 5', HT: 'Wi-Fi 4' }

const wifiGeneration = (modes) => {
  for (const mode of ['be', 'ax', 'ac', 'n']) {
    if (modes?.includes(mode)) return WIFI_GEN[mode]
  }
  return ''
}

const stationGeneration = (caps) => {
  for (const cap of ['EHT', 'HE', 'VHT', 'HT']) {
    if (caps?.includes(cap)) return CAP_GEN[cap]
  }
  return ''
}

export const radioRows = (radio) => {
  if (!radio) return []
  const rows = []
  if (radio.Freq) rows.push({ label: 'Band', value: bandFromFreq(radio.Freq) })
  if (radio.Channel) rows.push({ label: 'Channel', value: `${radio.Channel}` })
  if (radio.Modes?.length) {
    rows.push({
      label: 'Standard',
      value: `${wifiGeneration(radio.Modes)} (802.11${radio.Modes.join('/')})`
    })
  }
  rows.push({ label: 'Clients', value: `${radio.Stations || 0}` })
  return rows
}

export const EDITABLE_POLICIES = [
  'wan',
  'dns',
  'dns:family',
  'lan',
  'lan_upstream',
  'noapi'
]

export const FILTER_SECTIONS = [
  { key: 'status', title: 'Status', icon: ActivityIcon },
  { key: 'groups', title: 'Groups', icon: UsersIcon },
  { key: 'tags', title: 'Tags', icon: TagIcon },
  { key: 'policies', title: 'Policies', icon: ShieldCheckIcon },
  { key: 'classifications', title: 'Classification', icon: ScanSearchIcon }
]

export const FilterPanel = ({ options, filter, onToggle, onClear }) => (
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
    style={cardShadow}
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
