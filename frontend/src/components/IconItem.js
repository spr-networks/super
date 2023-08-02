import React from 'react'
import { Platform } from 'react-native'

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

const IconItem = ({ name, color, size, ...props }) => {
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

  let faIcons = {
    Desktop: faDesktop,
    Ethernet: faEthernet,
    Laptop: faLaptop,
    Mobile: faMobileScreen,
    Video: faVideo,
    Wifi: faWifi,
    Wired: faNetworkWired
  }

  let _size = size || 10

  let isFaIcon = Object.keys(faIcons).includes(name)
  if (isFaIcon) {
    let Component = React.createElement(Icon, {
      icon: faIcons[name],
      size: _size,
      color: color || 'blueGray.500'
    })

    return <>{Component}</>
  }

  let Component = BrandIcons[name]

  if (!okBrands.includes(name) || !Component) {
    return <></>
  }

  return <Component size={_size} color={color || 'blueGray.500'} {...props} />
}

export default IconItem
