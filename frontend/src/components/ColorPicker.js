import React, { useEffect, useState } from 'react'

import { HStack, Pressable } from '@gluestack-ui/themed'

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
    'fuchsia',
    'purple',
    'pink',
    'tertiary',
    'teal',
    'cyan',
    'blueGray',
    'dark',
    'amber'
  ]

  const onPress = (color) => {
    setSelected(color)
  }

  return (
    <HStack space="sm" w="$full" sx={{ '@md': { w: '$2/3' } }}>
      {colors.map((c) => (
        <Pressable
          flex={1}
          bg={`$${c}400`}
          opacity={value == c ? 1 : 0.25}
          p="$4"
          borderWidth={1}
          borderColor="$muted500"
          onPress={() => onPress(c)}
        />
      ))}
    </HStack>
  )
}
