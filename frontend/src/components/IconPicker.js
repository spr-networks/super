import React, { useEffect, useState } from 'react'

import Icon from 'FontAwesomeUtils'
import { BrandIcons } from 'FontAwesomeUtils'

import {
  faLaptop,
  faMobileScreen,
  faDesktop,
  faNetworkWired,
  faWifi,
  faVideo,
  faEthernet
} from '@fortawesome/free-solid-svg-icons'

import { HStack, Pressable, useColorModeValue } from 'native-base'

const IconItem = ({ name, data, color, ...props }) => {
  let Component = data

  //fa icon
  if (Component?.props?.icon !== undefined) {
    return <>{Component}</>
  }

  let size = 12

  return (
    <Component
      size={size}
      color={color || useColorModeValue('blueGray.600', 'blueGray.200')}
      {...props}
    />
  )
}

export default ({ value, color, onChange, ...props }) => {
  const [selected, setSelected] = useState(value)

  let icons = []

  useEffect(() => {
    console.log('INIT ICON', value)
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
    'Synology',
    'Sonos'
  ]

  let faIcons = {
    Desktop: faDesktop,
    Ethernet: faEthernet,
    Laptop: faLaptop,
    Mobile: faMobileScreen,
    Video: faVideo,
    Wifi: faWifi,
    Wired: faNetworkWired
  }

  icons = Object.keys(faIcons).map((name) => {
    return {
      name,
      icon: React.createElement(Icon, {
        icon: faIcons[name],
        size: 12,
        color:
          selected == name && color
            ? `${color}.400`
            : useColorModeValue('blueGray.600', 'blueGray.200')
      })
    }
  })

  icons = [
    ...icons,
    ...Object.keys(BrandIcons)
      .map((name) => {
        return {
          name,
          icon: BrandIcons[name]
        }
      })
      .filter(({ name }) => okBrands.includes(name))
  ]

  return (
    <HStack
      flexWrap={'wrap'}
      justifyContent={{ base: 'space-evenly', md: 'flex-start' }}
    >
      {icons.map(({ name, icon }) => (
        <Pressable
          onPress={() => setSelected(name)}
          p={2}
          opacity={selected == name ? 1 : 0.2}
        >
          <IconItem
            name={name}
            data={icon}
            color={
              selected == name
                ? color
                  ? `${color}.400`
                  : useColorModeValue('blueGray.200', 'blueGray.600')
                : ''
            }
          />
        </Pressable>
      ))}
    </HStack>
  )
}
