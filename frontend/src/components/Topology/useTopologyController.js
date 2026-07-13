import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useWindowDimensions } from 'react-native'

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
import { StyleEditor, parentChain } from 'components/Topology/topologyUI'

const POLICY_EDGE_RENDER_CAP = 150

export const useTopologyController = ({ navigate }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)

  const [topology, setTopology] = useState(null)
  const [selectedID, setSelectedID] = useState(null)
  const [collapsed, setCollapsed] = useState([])
  const [mode, setMode] = useState('physical')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedLinkID, setSelectedLinkID] = useState(null)
  const [connectFrom, setConnectFrom] = useState(null)
  const [connectTarget, setConnectTarget] = useState(null)
  const [connectChoice, setConnectChoice] = useState('')
  const [classifications, setClassifications] = useState({})
  const [routes, setRoutes] = useState([])
  const [deviceFilter, setDeviceFilter] = useState({
    status: [],
    groups: [],
    tags: [],
    policies: [],
    classifications: []
  })

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

    pfwAPI
      .config()
      .then((config) => setRoutes(config?.ForwardingRules || []))
      .catch(() => {})
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

  const addRoute = (node, sink, scope) => {
    const identity = deviceIdentity(node)
    if (!node.IP) {
      context.error('Cannot route this device: it has no IP address')
      return
    }
    const originalDst = scope.cidr || '0.0.0.0/0'
    const base = {
      RuleName: `Route ${node.Name || node.IP || identity} via ${sink.Name}`,
      Client: { SrcIP: node.IP },
      OriginalDst: { IP: originalDst },
      Dst: { IP: sink.IP || '' },
      DstInterface: sink.Iface
    }
    const rules = scope.port
      ? ['tcp', 'udp'].map((Protocol) => ({
          ...base,
          Protocol,
          OriginalDstPort: scope.port
        }))
      : [base]

    pfwAPI
      .config()
      .then((config) => {
        const existing = config?.ForwardingRules || []
        const duplicate = existing.some(
          (rule) =>
            rule.Client?.SrcIP == node.IP &&
            rule.DstInterface == sink.Iface &&
            (rule.OriginalDst?.IP || '') == originalDst
        )
        if (duplicate) {
          context.info(`A route for this device via ${sink.Name} already exists`)
          return
        }
        return Promise.all(rules.map((rule) => pfwAPI.addForward(rule))).then(
          () => {
            if (scope.dns) {
              updateDevice(identity, { DNSCustom: scope.dns })
            } else {
              refresh()
            }
          }
        )
      })
      .catch((error) => context.error('Failed to add route', error))
  }

  const onRemoveRoute = (index) => {
    pfwAPI
      .deleteForward(index)
      .then(() => refresh())
      .catch((error) => context.error('Failed to remove route', error))
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
    if (
      ['router', 'ap_radio', 'port', 'vpn', 'leaf_router', 'extension'].includes(
        node.Kind
      )
    ) {
      return true
    }
    if (!selectedID || node.ID == selectedID) return false
    if (selectedNode?.Kind != 'device' && selectedNode?.Kind != 'endpoint') {
      return false
    }
    if (node.Kind != 'device' && node.Kind != 'endpoint') return false
    return !allowedPeers.includes(node.ID)
  }

  return {
    context,
    navigate,
    compact,
    topology,
    setTopology,
    selectedID,
    setSelectedID,
    collapsed,
    setCollapsed,
    mode,
    setMode,
    filterOpen,
    setFilterOpen,
    selectedLinkID,
    setSelectedLinkID,
    connectFrom,
    setConnectFrom,
    connectTarget,
    setConnectTarget,
    connectChoice,
    setConnectChoice,
    classifications,
    setClassifications,
    deviceFilter,
    setDeviceFilter,
    routes,
    requestSeqRef,
    pollErrorRef,
    fittedRef,
    movedRef,
    connectFromRef,
    nodes,
    edges,
    sinks,
    attrFilterActive,
    filterActive,
    classOf,
    filterOptions,
    filteredNodes,
    layout,
    peerSummary,
    allowedPeers,
    physicalLinks,
    policyLinks,
    selectedLink,
    summary,
    selectedNode,
    isDimmed,
    positions,
    visible,
    junctions,
    parentOf,
    byID,
    uplinks,
    blocks,
    blockOf,
    refresh,
    toggleFilter,
    selectNode,
    selectLink,
    toggleCollapse,
    deviceIdentity,
    updateDevice,
    addRoute,
    editStyle,
    clearConnect,
    applyConnect,
    onRemoveRoute
  }
}

export default useTopologyController
