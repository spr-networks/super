import React from 'react'

import { Badge, BadgeIcon, BadgeText, useColorMode } from '@gluestack-ui/themed'
import {
  TagIcon,
  NetworkIcon,
  GlobeIcon,
  Globe2Icon,
  UsersIcon,
  WifiIcon
} from 'lucide-react-native'

const TagItem = React.memo(({ name, size }) => {
  //TODO - also use + fix tagItem component
  let colorMode = useColorMode()
  let bg = colorMode == 'light' ? '$blueGray200' : '$blueGray500'
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
    lan: NetworkIcon
  }

  let colorMode = useColorMode()

  let groupColors = {
    dns: colorMode == 'light' ? '$muted200' : '$blueGray700',
    lan: colorMode == 'light' ? '$muted100' : '$blueGray600',
    wan: colorMode == 'light' ? '$muted200' : '$blueGray700'
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
    >
      <BadgeText color={fg}>{name}</BadgeText>
      <BadgeIcon color={fg} as={icon} ml="$1" />
    </Badge>
  )
})

export default TagItem

export { TagItem, GroupItem }
