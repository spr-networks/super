import React, { useEffect, useState } from 'react'

import { HStack, Pressable } from '@gluestack-ui/themed'

import IconItem from './IconItem'

const IconPicker = ({ value, color, onChange, ...props }) => {
  const [selected, setSelected] = useState(null)

  let icons = []

  useEffect(() => {
    if (value) {
      setSelected(value)
    }
  }, [])

  useEffect(() => {
    if (onChange && selected && value && selected != value) {
      onChange(selected) //icons.find((i) => i.name == selected)
    }
  }, [selected])

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

  let faIcons = [
    'Desktop',
    'Ethernet',
    'Laptop',
    'Mobile',
    'Video',
    'Wif',
    'Wire'
  ]

  icons = [...faIcons, ...okBrands]

  return (
    <HStack
      flexWrap={'wrap'}
      justifyContent={{ base: 'space-between', md: 'flex-start' }}
    >
      {icons.map((name) => (
        <Pressable
          onPress={() => setSelected(name)}
          p="$2"
          sx={{
            '@base': { px: '$1' },
            '@md': { px: '$2' }
          }}
          opacity={selected == name ? 1 : 0.5}
        >
          <IconItem
            name={name}
            color={selected == name && color ? `${color}.400` : 'blueGray.500'}
            size={10}
          />
        </Pressable>
      ))}
    </HStack>
  )
}

export default IconPicker

export { IconPicker, IconItem }
