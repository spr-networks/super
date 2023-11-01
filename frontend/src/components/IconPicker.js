import React, { useEffect, useState } from 'react'

import { HStack, Pressable } from '@gluestack-ui/themed'

import IconItem from './IconItem'
import { Platform } from 'react-native'
import { Tooltip } from './Tooltip'

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

  let lucideIcons = [
    'Desktop',
    'Ethernet',
    'Laptop',
    'Mobile',
    'Router',
    'Tablet',
    'Tv',
    'Video',
    'Wifi',
    'Wire'
  ]

  icons = [...lucideIcons]
  if (Platform.OS == 'web') {
    icons = [...lucideIcons, ...okBrands]
  }

  return (
    <HStack
      flexWrap={'wrap'}
      justifyContent={{ base: 'space-between', md: 'flex-start' }}
    >
      {icons.map((name) => (
        <Tooltip label={name}>
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
              color={
                selected == name && color ? `$${color}400` : '$blueGray500'
              }
              size={48}
            />
          </Pressable>
        </Tooltip>
      ))}
    </HStack>
  )
}

export default IconPicker

export { IconPicker, IconItem }
