import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { PanResponder, View, useWindowDimensions } from 'react-native'
import { useNavigate } from 'react-router-dom'
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Marker,
  Path,
  Rect,
  Text as SvgText
} from 'react-native-svg'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Heading,
  Icon,
  Input,
  InputField,
  Pressable,
  Spinner,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import {
  FunnelIcon,
  LinkIcon,
  MaximizeIcon,
  RefreshCwIcon,
  ZoomInIcon,
  ZoomOutIcon
} from 'lucide-react-native'

import { AlertContext, ModalContext } from 'AppContext'
import { classifyAPI, deviceAPI, topologyAPI } from 'api'
import { pfwAPI } from 'api/Pfw'
import {
  arcPath,
  computeLayout,
  displayName,
  isIsolated,
  linkPath,
  COL_WIDTH,
  NODE_ANCHOR
} from 'components/Topology/topologyLayout'
import {
  DetailPanel,
  FilterPanel,
  LinkPanel,
  PALETTE,
  StyleEditor,
  TopologyNode,
  cardShadow,
  edgeDash,
  parentChain
} from 'components/Topology/topologyUI'

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
      <Svg width={26} height={10}>
        <Line
          x1={0}
          y1={5}
          x2={arrow ? 20 : 26}
          y2={5}
          stroke={color || palette.link}
          strokeWidth={2}
          strokeDasharray={dash}
        />
        {arrow ? (
          <Path d="M 19 1 L 26 5 L 19 9 z" fill={color || palette.link} />
        ) : null}
      </Svg>
    )}
    <Text size="2xs" color="$muted500">
      {label}
    </Text>
  </HStack>
)

//overlay card styling shared by the floating toolbars
const cardProps = {
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '$muted200',
  sx: { _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } },
  bg: '$backgroundCardLight'
}

const Topology = () => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
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
    status: [],
    groups: [],
    tags: [],
    policies: [],
    classifications: []
  })

  const containerRef = useRef(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const movedRef = useRef(false)
  const fittedRef = useRef(false)
  const [fitted, setFitted] = useState(false)
  const requestSeqRef = useRef(0)
  const pollErrorRef = useRef(false)

  const [canvas, setCanvas] = useState({ width: 0, height: 0 })
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas
  const viewRef = useRef(view)
  viewRef.current = view

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
  const sinks = topology?.Sinks || []

  const attrFilterActive =
    deviceFilter.groups.length > 0 ||
    deviceFilter.tags.length > 0 ||
    deviceFilter.policies.length > 0 ||
    deviceFilter.classifications.length > 0

  const filterActive = attrFilterActive || deviceFilter.status.length > 0

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
      status: ['online', 'offline'],
      groups: [...groups].sort(),
      tags: [...tags].sort(),
      policies: [...policies].sort(),
      classifications: [...classes].sort()
    }
  }, [nodes, classifications])

  const filteredNodes = useMemo(() => {
    const statusMatch = (node) =>
      !deviceFilter.status.length ||
      (deviceFilter.status.includes('online') && node.Online) ||
      (deviceFilter.status.includes('offline') && !node.Online)

    const attrMatch = (node) =>
      !attrFilterActive ||
      node.Groups?.some((group) => deviceFilter.groups.includes(group)) ||
      node.Tags?.some((tag) => deviceFilter.tags.includes(tag)) ||
      node.Policies?.some((policy) => deviceFilter.policies.includes(policy)) ||
      deviceFilter.classifications.includes(classOf(node))

    const deviceMatch = (node) => attrMatch(node) && statusMatch(node)

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
  }, [nodes, deviceFilter, attrFilterActive, classifications, connectFrom])

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
      .map((node) => ({ ID: node.ID, Name: displayName(node) }))
    const reachableFrom = others
      .filter((node) => sharesGroup(node) || node.Policies?.includes('lan'))
      .map((node) => ({ ID: node.ID, Name: displayName(node) }))
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
              ...(peerSummary.canReach || []).map((p) => p.ID),
              ...(peerSummary.reachableFrom || []).map((p) => p.ID),
              ...(peerSummary.endpoints || []).map((e) => e.ID),
              ...(peerSummary.endpointClients || []).map((c) => c.ID)
            ])
          ]
        : [],
    [peerSummary]
  )

  const fitView = () => {
    const rect = canvasRef.current
    if (rect.width < 100 || rect.height < 100) return

    //fit the online part of the network; offline piles shouldn't zoom everyone out
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    layout.visible.forEach((id) => {
      const node = layout.byID[id]
      const position = layout.positions[id]
      if (!position || !node) return
      if (node.Kind == 'device' && !node.Online) return
      minX = Math.min(minX, position.x)
      maxX = Math.max(maxX, position.x)
      minY = Math.min(minY, position.y)
      maxY = Math.max(maxY, position.y)
    })
    if (minX == Infinity) {
      minX = 0
      minY = 0
      maxX = layout.width
      maxY = layout.height
    }
    minX -= 100
    maxX += 100
    minY -= 70
    maxY += 80
    const contentW = maxX - minX
    const contentH = maxY - minY

    const minScale = compact ? 0.6 : 0.4
    const k = Math.min(
      1,
      Math.max(
        minScale,
        Math.min((rect.width - 40) / contentW, (rect.height - 40) / contentH)
      )
    )
    let x = (rect.width - contentW * k) / 2 - minX * k
    let y = Math.max((rect.height - contentH * k) / 2, 20) - minY * k
    const router = layout.positions['router']
    if (router && contentW * k > rect.width) {
      x = rect.width * 0.15 - router.x * k
    }
    if (router && contentH * k > rect.height) {
      y = rect.height / 2 - router.y * k
    }
    setView({ x, y, k })
    setFitted(true)
  }

  useEffect(() => {
    if (
      topology &&
      !fittedRef.current &&
      canvas.width >= 100 &&
      canvas.height >= 100
    ) {
      fittedRef.current = true
      fitView()
    }
  }, [topology, canvas])

  const zoom = (factor, cx, cy) => {
    setView((current) => {
      const k = Math.min(2.5, Math.max(0.25, current.k * factor))
      const rect = canvasRef.current
      const px = cx ?? rect.width / 2
      const py = cy ?? rect.height / 2
      return {
        x: px - ((px - current.x) * k) / current.k,
        y: py - ((py - current.y) * k) / current.k,
        k
      }
    })
  }

  const onCanvasLayout = (event) => {
    const { width, height } = event.nativeEvent.layout
    setCanvas({ width, height })
    containerRef.current?.measureInWindow?.((x, y) => {
      offsetRef.current = { x, y }
    })
  }

  const touchPoint = (touch) => ({
    x: touch.pageX - offsetRef.current.x,
    y: touch.pageY - offsetRef.current.y
  })

  const beginDrag = (touch) => {
    pinchRef.current = null
    dragRef.current = {
      startX: touch.pageX,
      startY: touch.pageY,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y
    }
  }

  const beginPinch = (touches) => {
    const [a, b] = touches
    const pa = touchPoint(a)
    const pb = touchPoint(b)
    dragRef.current = null
    pinchRef.current = {
      dist: Math.hypot(pa.x - pb.x, pa.y - pb.y),
      mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
      base: viewRef.current
    }
  }

  const moveGesture = (touches) => {
    if (touches.length >= 2) {
      if (!pinchRef.current) {
        beginPinch(touches)
        return
      }
      const [a, b] = touches
      const pa = touchPoint(a)
      const pb = touchPoint(b)
      const { dist, mid, base } = pinchRef.current
      const k = Math.min(
        2.5,
        Math.max(0.25, (base.k * Math.hypot(pa.x - pb.x, pa.y - pb.y)) / dist)
      )
      const newMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
      setView({
        x: newMid.x - ((mid.x - base.x) * k) / base.k,
        y: newMid.y - ((mid.y - base.y) * k) / base.k,
        k
      })
      return
    }
    if (!touches.length) return
    if (!dragRef.current) {
      beginDrag(touches[0])
      return
    }
    const drag = dragRef.current
    const dx = touches[0].pageX - drag.startX
    const dy = touches[0].pageY - drag.startY
    setView((current) => ({
      ...current,
      x: drag.viewX + dx,
      y: drag.viewY + dy
    }))
  }

  const endGesture = () => {
    dragRef.current = null
    pinchRef.current = null
    movedRef.current = false
  }

  //taps fall through to nodes/links; the responder takes over on movement or a
  //second finger, cancelling any in-flight press
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gesture) =>
          event.nativeEvent.touches.length == 2 ||
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          event.nativeEvent.touches.length == 2 ||
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
        onPanResponderGrant: (event) => {
          movedRef.current = true
          const touches = event.nativeEvent.touches
          if (touches.length >= 2) beginPinch(touches)
          else if (touches.length) beginDrag(touches[0])
        },
        onPanResponderMove: (event) => moveGesture(event.nativeEvent.touches),
        onPanResponderRelease: endGesture,
        onPanResponderTerminate: endGesture
      }),
    []
  )

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

  const clearSelection = () => {
    setSelectedID(null)
    setSelectedLinkID(null)
  }

  const deviceIdentity = (node) => node.MAC || node.ID?.replace(/^dev:/, '')

  const updateDevice = (identity, data) => {
    deviceAPI
      .update(identity, data)
      .then(() => refresh())
      .catch((error) => context.error('Failed to update device', error))
  }

  const addRoute = (node, sink, scope) => {
    const identity = deviceIdentity(node)
    const base = {
      RuleName: `Route ${node.Name || node.IP || identity} via ${sink.Name}`,
      Client: { Identity: identity },
      OriginalDst: { IP: scope.cidr || '0.0.0.0/0' },
      Dst: { IP: sink.IP || '' },
      DstInterface: sink.Iface
    }
    // port matching on an interface route needs a protocol: one rule per proto
    const rules = scope.port
      ? ['tcp', 'udp'].map((Protocol) => ({
          ...base,
          Protocol,
          OriginalDstPort: scope.port
        }))
      : [base]

    Promise.all(rules.map((rule) => pfwAPI.addForward(rule)))
      .then(() => {
        if (scope.dns) {
          updateDevice(identity, { DNSCustom: scope.dns })
        } else {
          refresh()
        }
      })
      .catch((error) => context.error('Failed to add route', error))
  }

  const editStyle = (node) => {
    const identity = deviceIdentity(node)
    modalContext.modal(
      'Icon & Color',
      <StyleEditor
        initialIcon={node.Style?.Icon || 'Laptop'}
        initialColor={node.Style?.Color || 'blueGray'}
        onChange={(Style) => updateDevice(identity, { Style })}
      />
    )
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

  const toggleCollapse = (id) => {
    setCollapsed((current) =>
      current.includes(id)
        ? current.filter((entry) => entry != id)
        : [...current, id]
    )
  }

  const { positions, visible, junctions, parentOf, byID, uplinks, blocks, blockOf } =
    layout

  const physicalLinks = useMemo(() => {
    const junctionByParent = Object.fromEntries(
      junctions.filter((j) => !j.collapsed).map((j) => [j.id, j])
    )
    const links = []

    visible.forEach((id) => {
      if (id == 'router' || uplinks.includes(id)) return
      const parent = parentOf[id]
      if (!parent || !positions[parent] || !positions[id]) return

      //block members share one connector; only the selection gets its own edge
      if (blockOf[id] && id != selectedID) return

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

    blocks.forEach((block) => {
      const parent = block.parent
      if (!positions[parent]) return
      const junction = junctionByParent[parent]
      const from = junction || {
        x: positions[parent].x + NODE_ANCHOR,
        y: positions[parent].y
      }
      links.push({
        id: `${parent}>${block.id}`,
        layer: 'l1',
        block: true,
        node: byID[block.members[0]],
        path: linkPath(from.x, from.y, block.x - 4, block.y + block.height / 2),
        onPath: false
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
  }, [visible, positions, junctions, parentOf, byID, uplinks, blocks, blockOf, selectedID, mode])

  const POLICY_EDGE_RENDER_CAP = 150

  const policyLinks = useMemo(() => {
    if (mode != 'policy') return []
    const litIDs = selectedID ? new Set([selectedID, ...allowedPeers]) : null
    let policyEdges = edges.filter(
      (edge) =>
        edge.Layer == 'policy' &&
        positions[edge.From] &&
        positions[edge.To] &&
        visible.has(edge.From) &&
        visible.has(edge.To)
    )
    //too dense to read as a hairball: only draw edges touching the selection
    if (policyEdges.length > POLICY_EDGE_RENDER_CAP) {
      policyEdges = selectedID
        ? policyEdges.filter(
            (edge) => edge.From == selectedID || edge.To == selectedID
          )
        : []
    }
    return policyEdges
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
      <Box alignItems="center" justifyContent="center" h="$full">
        <Spinner size="large" />
      </Box>
    )
  }

  //RN scales about the view center; compensate to emulate a top-left origin
  const translateX = view.x + (layout.width / 2) * (view.k - 1)
  const translateY = view.y + (layout.height / 2) * (view.k - 1)

  return (
    <Box h="$full" overflow="hidden" style={{ backgroundColor: palette.canvas }}>
      <View
        ref={containerRef}
        onLayout={onCanvasLayout}
        style={{ flex: 1, overflow: 'hidden' }}
        {...panResponder.panHandlers}
      >
        <Pressable style={{ flex: 1 }} onPress={clearSelection}>
          <View
            style={{
              position: 'absolute',
              width: layout.width,
              height: layout.height,
              opacity: fitted ? 1 : 0,
              transform: [
                { translateX },
                { translateY },
                { scale: view.k }
              ]
            }}
          >
            <Svg
              width={layout.width}
              height={layout.height}
              style={{ position: 'absolute' }}
            >
              <Defs>
                <Marker
                  id="topoArrowPolicy"
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="5.5"
                  markerHeight="5.5"
                  orient="auto-start-reverse"
                >
                  <Path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill={palette.policy} />
                </Marker>
                <Marker
                  id="topoArrowEndpoint"
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="5.5"
                  markerHeight="5.5"
                  orient="auto-start-reverse"
                >
                  <Path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill={palette.endpoint} />
                </Marker>
              </Defs>
              {blocks.map((block) => {
                const quarantine = block.kind == 'quarantine'
                return (
                  <G key={block.id} opacity={mode == 'policy' ? 0.3 : 1}>
                    <Rect
                      x={block.x}
                      y={block.y}
                      width={block.width}
                      height={block.height}
                      rx={16}
                      fill={quarantine ? palette.isolated : palette.iconBg}
                      fillOpacity={quarantine ? 0.05 : 0.25}
                      stroke={quarantine ? palette.isolated : palette.iconBorder}
                      strokeOpacity={quarantine ? 0.5 : 1}
                      strokeDasharray="4 6"
                    />
                    <SvgText
                      x={block.x + 12}
                      y={block.y + 16}
                      fontSize={10}
                      fill={quarantine ? palette.isolated : palette.sublabel}
                    >
                      {block.members.length}{' '}
                      {quarantine
                        ? 'quarantined'
                        : block.kind == 'isolated'
                          ? 'isolated — no policies'
                          : block.kind == 'offline'
                            ? 'offline'
                            : 'devices · ' + (byID[block.parent]?.Name || '')}
                    </SvgText>
                  </G>
                )
              })}

              {physicalLinks.map((link) => {
                const dash = link.straight ? null : edgeDash(link.node)
                const linkSelected = link.id == selectedLinkID
                return (
                  <Path
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
                  />
                )
              })}

              {policyLinks.map((link) => {
                const marker = link.endpoint
                  ? 'url(#topoArrowEndpoint)'
                  : 'url(#topoArrowPolicy)'
                return (
                  <Path
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
                .filter((link) => !link.straight && !link.block)
                .map((link) => (
                  <Path
                    key={`hit:${link.id}`}
                    d={link.path}
                    fill="none"
                    stroke={palette.link}
                    strokeOpacity={0.01}
                    strokeWidth={14}
                    onPress={() => selectLink(link)}
                  />
                ))}

              {junctions.map((junction) => (
                <G
                  key={junction.id}
                  opacity={mode == 'policy' ? 0.25 : 1}
                  onPress={() => toggleCollapse(junction.id)}
                >
                  <Circle
                    cx={junction.x}
                    cy={junction.y}
                    r={junction.collapsed ? 11 : 9}
                    fill={palette.junctionFill}
                  />
                  <SvgText
                    x={junction.x}
                    y={junction.y + 3.5}
                    textAnchor="middle"
                    fontSize={junction.collapsed ? 9 : 11}
                    fontWeight="600"
                    fill={palette.junctionText}
                  >
                    {junction.collapsed ? `+${junction.count}` : '−'}
                  </SvgText>
                </G>
              ))}
            </Svg>

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
          </View>
        </Pressable>
      </View>

      <HStack
        position="absolute"
        top={16}
        left={16}
        space="sm"
        alignItems="center"
      >
        <HStack {...cardProps} p="$0.5">
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

        <Button
          size="xs"
          variant={filterActive ? 'solid' : 'outline'}
          action={filterActive ? 'primary' : 'secondary'}
          onPress={() => setFilterOpen((current) => !current)}
        >
          <ButtonIcon as={FunnelIcon} />
          {filterActive ? (
            <ButtonText ml="$1">
              {deviceFilter.status.length +
                deviceFilter.groups.length +
                deviceFilter.tags.length +
                deviceFilter.policies.length +
                deviceFilter.classifications.length}
            </ButtonText>
          ) : null}
        </Button>
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
        {...cardProps}
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
        {...cardProps}
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
        <>
          <Pressable
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            onPress={() => setFilterOpen(false)}
          />
          <FilterPanel
            options={filterOptions}
            filter={deviceFilter}
            onToggle={toggleFilter}
            onClear={() => {
              setDeviceFilter({
                status: [],
                groups: [],
                tags: [],
                policies: [],
                classifications: []
              })
              setFilterOpen(false)
            }}
          />
        </>
      ) : null}

      {mode == 'policy' &&
      !selectedID &&
      policyLinks.length == 0 &&
      edges.some((edge) => edge.Layer == 'policy') ? (
        <HStack
          position="absolute"
          bottom={16}
          left={0}
          right={0}
          justifyContent="center"
          pointerEvents="none"
        >
          <HStack {...cardProps} px="$3" py="$1.5">
            <Text size="xs" color="$muted500">
              Too many rules to draw at once — select a device to see its access
            </Text>
          </HStack>
        </HStack>
      ) : null}

      {connectFrom && !connectTarget ? (
        <HStack
          position="absolute"
          top={16}
          left={0}
          right={0}
          justifyContent="center"
          pointerEvents="box-none"
        >
          <HStack
            {...cardProps}
            borderColor="$primary400"
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
        </HStack>
      ) : null}

      {connectTarget ? (
        <HStack
          position="absolute"
          top="30%"
          left={0}
          right={0}
          justifyContent="center"
          pointerEvents="box-none"
        >
          <Box
            w={300}
            {...cardProps}
            borderRadius={12}
            style={cardShadow}
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
        </HStack>
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
          onEditStyle={editStyle}
          onClose={() => setSelectedID(null)}
          onUpdateDevice={updateDevice}
          onConnect={(node) => {
            setConnectFrom(node)
            setSelectedID(null)
            setMode('policy')
          }}
          onSelectPeer={(id) => setSelectedID(id)}
          sinks={sinks}
          onAddRoute={addRoute}
        />
      ) : null}
    </Box>
  )
}

export default Topology
