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

const TagItem = React.memo(({ name }) => {
  //TODO - also use + fix tagItem component
  return (
    <Badge
      key={name}
      action="muted"
      variant="outline"
      size="sm"
      py="$1"
      px="$2"
    >
      <BadgeText>{name}</BadgeText>
      <BadgeIcon as={TagIcon} ml="$1" />
    </Badge>
  )
})

const GroupItem = React.memo(({ name }) => {
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
  let bg = groupColors[name] || '$muted600'

  return (
    <Badge
      key={name}
      action="muted"
      variant="outline"
      bg={bg}
      size="sm"
      py="$1"
      px="$2"
    >
      <BadgeText>{name}</BadgeText>
      <BadgeIcon as={icon} ml="$1" />
    </Badge>
  )
})

export default TagItem

export { TagItem, GroupItem }
