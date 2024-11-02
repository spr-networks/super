import React, { useEffect, useState } from 'react'

import { HStack, Pressable } from '@gluestack-ui/themed'
import { Tooltip } from './Tooltip'

export default ({ value, onChange, ...props }) => {
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    setSelected(value)
  }, [])

  useEffect(() => {
    if (selected != value && onChange) {
      onChange(selected)
    }
  }, [selected])

  let colors = [
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'red',
    'tertiary',
    'teal',
    'cyan',
    'blueGray',
    'amber',
    'orange'
  ]

  const onPress = (color) => {
    setSelected(color)
  }

  return (
    <HStack space="md" w="$full" flexWrap="wrap">
      {colors.map((c) => (
        <Tooltip label={c}>
          <Pressable
            flex={1}
            bg={`$${c}400`}
            opacity={value == c ? 1 : 0.25}
            sx={{ '@base': { p: '$6' }, '@md': { p: '$4' } }}
            borderWidth={1}
            borderColor="$muted500"
            onPress={() => onPress(c)}
          />
        </Tooltip>
      ))}
    </HStack>
  )
}
