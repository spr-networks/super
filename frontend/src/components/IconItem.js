import React from 'react'

import { Box, Icon } from '@gluestack-ui/themed'
import { BrandIcons } from 'IconUtils'

import {
  Computer,
  Laptop,
  Laptop2,
  Cable,
  Network,
  Router,
  Smartphone,
  Tv,
  Video,
  Wifi,
  Tablet,
  Globe,
  Globe2
} from 'lucide-react-native'

let okBrands = [
  'Apple',
  'Android',
  'Linux',
  'Microsoft',
  'PlayStation',
  'RaspberryPi',
  'Synology',
  'Sonos'
]

let deviceIcons = {
  Ethernet: Network,
  Desktop: Computer,
  Laptop: Laptop2,
  Mobile: Smartphone,
  Router: Router,
  Tablet: Tablet,
  Tv: Tv,
  Video: Video,
  Wifi: Wifi,
  Wire: Cable
}

let groupIcons = {
  wan: Globe2,
  dns: Globe,
  lan: Network
}

const IconItem = ({ name, color, size: _size, ...props }) => {
  let size = _size || 64

  let isLIcon = Object.keys(deviceIcons).includes(name)
  let isGroupOrTag = Object.keys(groupIcons).includes(name)
  let lucideIcons = { ...deviceIcons, ...groupIcons }

  if (isLIcon || isGroupOrTag) {
    return <Icon as={lucideIcons[name]} color={color} size={size} {...props} />
  }

  if (!okBrands.includes(name)) {
    return <></>
  }

  return (
    <Icon as={BrandIcons[name]} color={color} size={size} w={size} {...props} />
  )
}

const DeviceIcon = (name) => {
  if (Object.keys(lucideIcons).includes(name)) {
    return lucideIcons[name]
  }

  return BrandIcons[name] || null
}

export default IconItem
