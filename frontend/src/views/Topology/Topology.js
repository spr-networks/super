import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, View } from 'react-native'
import { useNavigate } from 'react-router-native'
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

import { displayName } from 'components/Topology/topologyLayout'
import {
  DetailPanel,
  FilterPanel,
  LinkPanel,
  PALETTE,
  TopologyNode,
  cardShadow,
  edgeDash
} from 'components/Topology/topologyUI'
import { useTopologyController } from 'components/Topology/useTopologyController'

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

const cardProps = {
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '$muted200',
  sx: { _dark: { borderColor: '$muted800', bg: '$backgroundCardDark' } },
  bg: '$backgroundCardLight'
}

const Topology = () => {
  const navigate = useNavigate()
  const colorMode = useColorMode()
  const palette = PALETTE[colorMode] || PALETTE.light

  const {
    compact,
    topology,
    selectedID,
    setSelectedID,
    mode,
    setMode,
    filterOpen,
    setFilterOpen,
    selectedLinkID,
    setSelectedLinkID,
    connectFrom,
    setConnectFrom,
    connectTarget,
    connectChoice,
    setConnectChoice,
    classifications,
    deviceFilter,
    setDeviceFilter,
    routes,
    fittedRef,
    movedRef,
    edges,
    sinks,
    filterActive,
    filterOptions,
    layout,
    peerSummary,
    physicalLinks,
    policyLinks,
    selectedLink,
    summary,
    selectedNode,
    isDimmed,
    positions,
    visible,
    junctions,
    byID,
    blocks,
    refresh,
    toggleFilter,
    selectNode,
    selectLink,
    toggleCollapse,
    updateDevice,
    addRoute,
    editStyle,
    clearConnect,
    applyConnect,
    onRemoveRoute
  } = useTopologyController({ navigate })

  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [fitted, setFitted] = useState(false)
  const [canvas, setCanvas] = useState({ width: 0, height: 0 })

  const containerRef = useRef(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas
  const viewRef = useRef(view)
  viewRef.current = view

  const fitView = () => {
    const rect = canvasRef.current
    if (rect.width < 100 || rect.height < 100) return

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

  const clearSelection = () => {
    setSelectedID(null)
    setSelectedLinkID(null)
  }

  if (!topology) {
    return (
      <Box alignItems="center" justifyContent="center" h="$full">
        <Spinner size="large" />
      </Box>
    )
  }

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
                            : block.kind == 'extensions'
                              ? 'containers'
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
          routes={routes}
          onRemoveRoute={onRemoveRoute}
        />
      ) : null}
    </Box>
  )
}

export default Topology
