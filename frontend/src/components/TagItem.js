import React from 'react'
import PropTypes from 'prop-types'

import { Badge, BadgeIcon, BadgeText, useColorMode } from '@gluestack-ui/themed'
import {
  CableIcon,
  RouteIcon,
  TagIcon,
  NetworkIcon,
  GlobeIcon,
  Globe2Icon,
  UsersIcon,
  WifiIcon,
  PowerIcon
} from 'lucide-react-native'

const TagItem = React.memo(({ name, size, ...props }) => {
  //TODO - also use + fix tagItem component
  let colorMode = useColorMode()
  let bg = props.bg || (colorMode == 'light' ? '$blueGray200' : '$blueGray500')
  let fg = props.color || (colorMode == 'light' ? '$muted800' : '$muted100')

  return (
    <Badge
      key={name}
      action="muted"
      variant="solid"
      bg={bg}
      size={size || 'sm'}
      py="$1"
      px="$2"
      rounded="$lg"
    >
      <BadgeText color={fg}>{name}</BadgeText>
      <BadgeIcon color={fg} as={TagIcon} ml="$1" />
    </Badge>
  )
})

const GroupItem = React.memo(({ name, size }) => {
  let groupIcons = {
    wan: Globe2Icon,
    dns: GlobeIcon,
    lan: RouteIcon //NetworkIcon is crammed
  }

  let colorMode = useColorMode()

  let groupColors = {
    dns: colorMode == 'light' ? '$blueGray200' : '$blueGray700',
    lan: colorMode == 'light' ? '$blueGray100' : '$blueGray600',
    wan: colorMode == 'light' ? '$blueGray200' : '$blueGray700'
  }

  let icon = groupIcons[name] || UsersIcon
  let bg = groupColors[name] || '$muted200'
  let fg = colorMode == 'light' ? '$muted800' : '$muted100'

  return (
    <Badge
      key={name}
      action="muted"
      variant="solid"
      bg={bg}
      size={size || 'sm'}
      py="$1"
      px="$2"
      rounded="$lg"
    >
      <BadgeText color={fg}>{name}</BadgeText>
      <BadgeIcon color={fg} as={icon} ml="$1" />
    </Badge>
  )
})

const InterfaceItem = React.memo(({ name, size, ...props }) => {
  let isWifi = name.startsWith('wlan')
  let isOffline = !name.length
  let colorMode = useColorMode()

  let k = isWifi ? 'wifi' : isOffline ? 'offline' : 'ethernet'

  let styles = {
    wifi: {
      bg: { light: '$blueGray200', dark: '$blueGray700' },
      fg: { light: '$muted600', dark: '$muted300' },
      icon: WifiIcon
    },
    ethernet: {
      bg: { light: '$muted200', dark: '$muted800' },
      fg: { light: '$muted600', dark: '$muted200' },
      icon: CableIcon
    },
    offline: {
      bg: { light: '$muted100', dark: '$blueGray800' },
      fg: { light: '$muted400', dark: '$blueGray600' },
      icon: PowerIcon
    }
  }

  let icon = styles[k].icon

  let bg = props.bg || styles[k].bg[colorMode]
  let fg = props.color || styles[k].fg[colorMode]

  return (
    <Badge
      action="muted"
      variant="solid"
      bg={bg}
      size={size || 'md'}
      rounded="$lg"
    >
      {icon != PowerIcon ? <BadgeIcon color={fg} as={icon} mr="$1" /> : null}
      <BadgeText color={fg}>{name?.length ? name : 'offline'}</BadgeText>
    </Badge>
  )
})

TagItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

GroupItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

InterfaceItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

export default TagItem

export { TagItem, GroupItem, InterfaceItem }
