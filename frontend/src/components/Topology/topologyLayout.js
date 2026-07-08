export const COL_WIDTH = 230
export const ROW_HEIGHT = 98
export const MARGIN_X = 90
export const MARGIN_Y = 70
export const NODE_ANCHOR = 32

const KIND_ORDER = {
  uplink: 0,
  ap_radio: 1,
  port: 2,
  leaf_router: 3,
  vpn: 4,
  device: 5,
  endpoint: 6
}

export const isIsolated = (node) =>
  node?.Kind == 'device' &&
  (node.Isolated ||
    node.Policies?.includes('quarantine') ||
    node.Policies?.includes('disabled'))

export const signalColor = (rssi) => {
  if (rssi >= -60) return '#22c55e'
  if (rssi >= -70) return '#38bdf8'
  if (rssi >= -80) return '#f59e0b'
  return '#ef4444'
}

export const displayName = (node) =>
  node?.Name || node?.MAC || node?.IP || node?.ID || ''

export const buildTree = (nodes, edges) => {
  const byID = Object.fromEntries(nodes.map((node) => [node.ID, node]))
  const adjacency = {}
  const connect = (a, b) => {
    if (!adjacency[a]) adjacency[a] = []
    adjacency[a].push(b)
  }

  edges
    .filter((edge) => edge.Layer == 'l1')
    .forEach((edge) => {
      connect(edge.From, edge.To)
      connect(edge.To, edge.From)
    })

  const children = {}
  const parentOf = {}
  const queue = ['router']
  const seen = new Set(queue)

  while (queue.length) {
    const id = queue.shift()
    for (const next of adjacency[id] || []) {
      if (seen.has(next) || !byID[next]) continue
      seen.add(next)
      parentOf[next] = id
      if (!children[id]) children[id] = []
      children[id].push(next)
      queue.push(next)
    }
  }

  nodes.forEach((node) => {
    if (!seen.has(node.ID) && node.Kind == 'device') {
      parentOf[node.ID] = 'router'
      if (!children['router']) children['router'] = []
      children['router'].push(node.ID)
    }
  })

  const sortKey = (id) => {
    const node = byID[id] || {}
    return [
      KIND_ORDER[node.Kind] ?? 9,
      node.Online ? 0 : 1,
      displayName(node).toLowerCase()
    ]
  }

  Object.values(children).forEach((ids) =>
    ids.sort((a, b) => {
      const [ka, oa, na] = sortKey(a)
      const [kb, ob, nb] = sortKey(b)
      return ka - kb || oa - ob || (na > nb ? 1 : na < nb ? -1 : 0)
    })
  )

  return { children, parentOf, byID }
}

const countDescendants = (id, children) => {
  let count = 0
  const stack = [...(children[id] || [])]
  while (stack.length) {
    const next = stack.pop()
    count++
    stack.push(...(children[next] || []))
  }
  return count
}

export const computeLayout = (nodes, edges, collapsedIDs = []) => {
  const collapsed = new Set(collapsedIDs)
  const { children, parentOf, byID } = buildTree(nodes, edges)

  const uplinks = (children['router'] || []).filter(
    (id) => byID[id]?.Kind == 'uplink' && !(children[id] || []).length
  )
  const treeChildren = {
    ...children,
    router: (children['router'] || []).filter((id) => !uplinks.includes(id))
  }

  const rows = {}
  const depths = {}
  const visible = new Set(['router', ...uplinks])
  const blocks = []
  const blockOf = {}
  let nextRow = 0

  const MAX_COLUMN_ROWS = 10

  const walk = (id, depth) => {
    depths[id] = depth
    const kids = collapsed.has(id) ? [] : treeChildren[id] || []
    if (!kids.length) {
      rows[id] = nextRow++
      return rows[id]
    }

    let first = null
    let last = null
    const visit = (row) => {
      if (first == null) first = row
      last = row
    }

    const leafKids = kids.filter((kid) => !(treeChildren[kid] || []).length)
    const branchKids = kids.filter((kid) => (treeChildren[kid] || []).length)

    branchKids.forEach((kid) => {
      visible.add(kid)
      visit(walk(kid, depth + 1))
    })

    if (leafKids.length > MAX_COLUMN_ROWS) {
      //wrap a large fan of leaves into a grid block with one connector
      const blockStart = nextRow
      const blockID = 'block:' + id
      leafKids.forEach((kid, index) => {
        visible.add(kid)
        depths[kid] = depth + 1 + Math.floor(index / MAX_COLUMN_ROWS)
        rows[kid] = blockStart + (index % MAX_COLUMN_ROWS)
        blockOf[kid] = blockID
      })
      blocks.push({ id: blockID, parent: id, members: leafKids })
      nextRow = blockStart + Math.min(leafKids.length, MAX_COLUMN_ROWS)
      visit(blockStart)
      visit(nextRow - 1)
    } else {
      leafKids.forEach((kid) => {
        visible.add(kid)
        visit(walk(kid, depth + 1))
      })
    }

    rows[id] = (first + last) / 2
    return rows[id]
  }

  walk('router', 1)

  uplinks.forEach((id, index) => {
    depths[id] = 0
    rows[id] = rows['router'] + index - (uplinks.length - 1) / 2
  })

  let treeDepth = 1
  visible.forEach((id) => {
    treeDepth = Math.max(treeDepth, depths[id])
  })
  nodes
    .filter((node) => node.Kind == 'endpoint')
    .forEach((node, index) => {
      depths[node.ID] = treeDepth + 1
      rows[node.ID] = index
      visible.add(node.ID)
    })

  let minRow = 0
  visible.forEach((id) => {
    minRow = Math.min(minRow, rows[id])
  })

  const positions = {}
  let maxDepth = 1
  let maxRow = 1
  visible.forEach((id) => {
    positions[id] = {
      x: MARGIN_X + depths[id] * COL_WIDTH,
      y: MARGIN_Y + (rows[id] - minRow) * ROW_HEIGHT
    }
    maxDepth = Math.max(maxDepth, depths[id])
    maxRow = Math.max(maxRow, rows[id] - minRow)
  })

  blocks.forEach((block) => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    block.members.forEach((member) => {
      const position = positions[member]
      minX = Math.min(minX, position.x)
      maxX = Math.max(maxX, position.x)
      minY = Math.min(minY, position.y)
      maxY = Math.max(maxY, position.y)
    })
    block.x = minX - 80
    block.y = minY - 42
    block.width = maxX - minX + 160
    block.height = maxY - minY + 96
  })

  const junctions = []
  visible.forEach((id) => {
    if (byID[id]?.Kind == 'device') return
    const kids = treeChildren[id] || []
    if (!kids.length) return
    if (collapsed.has(id)) {
      junctions.push({
        id,
        x: positions[id].x + COL_WIDTH * 0.55,
        y: positions[id].y,
        count: countDescendants(id, treeChildren),
        collapsed: true
      })
    } else if (kids.length > 1) {
      junctions.push({
        id,
        x: positions[id].x + COL_WIDTH * 0.55,
        y: positions[id].y,
        count: kids.length,
        collapsed: false
      })
    }
  })

  return {
    positions,
    visible,
    junctions,
    parentOf,
    childrenOf: treeChildren,
    byID,
    uplinks,
    blocks,
    blockOf,
    width: MARGIN_X * 2 + (maxDepth + 0.6) * COL_WIDTH,
    height: MARGIN_Y * 2 + (maxRow + 0.5) * ROW_HEIGHT
  }
}

export const linkPath = (x1, y1, x2, y2) => {
  const dx = Math.max(28, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export const arcPath = (x1, y1, x2, y2) => {
  const bulge = 52 + Math.abs(y2 - y1) / 4
  return `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2} ${y2}`
}
