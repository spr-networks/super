import React from 'react'
import PropTypes from 'prop-types'

import { Badge, BadgeIcon, BadgeText, useColorMode } from '@gluestack-ui/themed'
import {
  CableIcon,
  RouteIcon,
  FileSearch,
  TagIcon,
  NetworkIcon,
  GlobeIcon,
  Globe2Icon,
  UsersIcon,
  WifiIcon,
  PowerIcon,
  ArrowUpFromDot,
  ArrowLeftRight
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

const PolicyItem = React.memo(({ name, size }) => {
  let policyIcons = {
    wan: Globe2Icon,
    dns: FileSearch,
    lan: ArrowLeftRight, //NetworkIcon is crammed
    api: RouteIcon,
    lan_upstream: ArrowUpFromDot,
    disabled: RouteIcon,
  }

  let colorMode = useColorMode()

  let policyColors = {
    dns: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
    lan: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
    wan: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
    api: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
    lan_upstream: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
    disabled: colorMode == 'light' ? '$blueGray300' : '$blueGray700',
  }

  let icon = policyIcons[name] || UsersIcon
  let bg = policyColors[name] || '$muted200'
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

const GroupItem = React.memo(({ name, size, ...props }) => {
  let colorMode = useColorMode()

  let icon = UsersIcon
  let bg = props.bg || (colorMode == 'light' ? '$blueGray100' : '$blueGray600')
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
      <BadgeIcon color={fg} as={icon} ml="$1" />
    </Badge>
  )
})

const InterfaceItem = React.memo(({ name, address, size, ...props }) => {
  if (!name) return <></>

  let isWifi = name?.startsWith('wlan')
  let isOffline = !name?.length
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
      size={size || 'sm'}
      rounded="$lg"
      {...props}
    >
      {icon != PowerIcon ? <BadgeIcon color={fg} as={icon} mr="$1" /> : null}
      <BadgeText color={fg} bold={address ? true : false}>
        {name?.length ? name : 'offline'}
      </BadgeText>
      {address ? (
        <BadgeText color={fg} ml="$1">
          {address}
        </BadgeText>
      ) : null}
    </Badge>
  )
})

const ProtocolItem = ({ name, size, ...props }) => {
  return (
    <Badge action="muted" variant="outline" size={size || 'md'} {...props}>
      <BadgeText>{name}</BadgeText>
    </Badge>
  )
}

TagItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

GroupItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

PolicyItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

InterfaceItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

ProtocolItem.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.any
}

export default TagItem

export { TagItem, GroupItem, InterfaceItem, ProtocolItem, PolicyItem }
