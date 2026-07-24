export const rustapModes = [
  { label: '2.4 GHz', value: 'g', band: 2.4 },
  { label: '5 GHz', value: 'a', band: 5 },
  { label: '6 GHz', value: '6', band: 6 }
]

export const rustapModeFromBand = (band) => {
  const match = rustapModes.find((mode) => mode.band === Number(band))
  return match ? match.value : 'a'
}

export const rustapBandFromMode = (mode) => {
  const match = rustapModes.find((entry) => entry.value === mode)
  return match ? match.band : 5
}

export const rustapBandFromFrequency = (frequency) => {
  const value = Number(frequency)
  if (value < 3000) return 2.4
  if (value < 5900) return 5
  return 6
}

export const rustapWidthsForBand = (band) => {
  if (Number(band) === 2.4) return [20, 40]
  if (Number(band) === 5) return [20, 40, 80, 160]
  if (Number(band) === 6) return [20, 40, 80, 160, 320]
  return []
}

export const rustapSecondaryLink = (config) => {
  if (!Array.isArray(config.mld_links)) return null
  const associationLinkID = Number(config.link_id ?? 0)
  return (
    config.mld_links.find(
      (link) => Number(link.link_id) !== associationLinkID
    ) || null
  )
}

const firstUnusedLinkID = (links, associationLinkID) => {
  const used = new Set(links.map((link) => Number(link.link_id)))
  for (let linkID = 0; linkID <= 15; linkID += 1) {
    if (linkID !== associationLinkID && !used.has(linkID)) return linkID
  }
  throw new Error('RustAP MLO has no available link ID')
}

const requireInteger = (name, value) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`)
  }
  return parsed
}

export const buildRustapRadioPatch = ({
  config,
  channel,
  width,
  mode,
  phy,
  mld,
  secondaryBand,
  secondaryChannel,
  secondaryWidth,
  secondaryLinkID
}) => {
  const primaryChannel = requireInteger('channel', channel)
  const primaryWidth = requireInteger('width', width)
  const primaryBand = rustapBandFromMode(mode)
  const selectedSecondaryBand = Number(secondaryBand)
  const patch = {
    channel: primaryChannel,
    width: primaryWidth,
    band: primaryBand,
    phy,
    mld
  }

  if (!mld) return patch
  if (![2.4, 5, 6].includes(selectedSecondaryBand)) {
    throw new Error('secondary band must be 2.4, 5, or 6')
  }
  if (
    !rustapWidthsForBand(selectedSecondaryBand).includes(Number(secondaryWidth))
  ) {
    throw new Error('secondary width is not valid for its band')
  }

  const associationLinkID = requireInteger(
    'association link ID',
    config.link_id ?? 0
  )
  const existingLinks = Array.isArray(config.mld_links)
    ? config.mld_links.map((link) => ({
        link_id: link.link_id,
        channel: link.channel,
        width: link.width,
        band: link.band
      }))
    : []
  let selectedSecondaryLinkID =
    secondaryLinkID === null || secondaryLinkID === undefined
      ? null
      : requireInteger('secondary link ID', secondaryLinkID)

  if (selectedSecondaryLinkID === associationLinkID) {
    selectedSecondaryLinkID = null
  }
  if (selectedSecondaryLinkID === null) {
    const existingSecondary = rustapSecondaryLink(config)
    selectedSecondaryLinkID = existingSecondary
      ? requireInteger('secondary link ID', existingSecondary.link_id)
      : firstUnusedLinkID(existingLinks, associationLinkID)
  }

  const primaryLink = {
    link_id: associationLinkID,
    channel: primaryChannel,
    width: primaryWidth,
    band: primaryBand
  }
  const secondaryLink = {
    link_id: selectedSecondaryLinkID,
    channel: requireInteger('secondary channel', secondaryChannel),
    width: requireInteger('secondary width', secondaryWidth),
    band: selectedSecondaryBand
  }

  const linksByID = new Map(
    existingLinks.map((link) => [Number(link.link_id), link])
  )
  linksByID.set(associationLinkID, {
    ...linksByID.get(associationLinkID),
    ...primaryLink
  })
  linksByID.set(selectedSecondaryLinkID, {
    ...linksByID.get(selectedSecondaryLinkID),
    ...secondaryLink
  })
  patch.mld_links = Array.from(linksByID.values()).sort(
    (left, right) => Number(left.link_id) - Number(right.link_id)
  )
  return patch
}
