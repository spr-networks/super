import React from 'react'

import { Icon } from 'FontAwesomeUtils'
import { faTag } from '@fortawesome/free-solid-svg-icons'

import { Badge, BadgeText } from '@gluestack-ui/themed'

const TagItem = React.memo(({ name }) => {
  return (
    <Badge key={name} action="muted" variant="outline" size="sm">
      <Icon icon={faTag} size={3} />
      <BadgeText>{name}</BadgeText>
    </Badge>
  )
})

export default TagItem
