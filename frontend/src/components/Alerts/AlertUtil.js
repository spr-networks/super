import React from 'react'
import { Platform } from 'react-native'
import DeviceItem from 'components/Devices/DeviceItem'

import { InterfaceItem } from 'components/TagItem'

import { HStack, Text } from '@gluestack-ui/themed'

export const transformTag = (context, tag, value) => {
  if (context) {
    let type = 'RecentIP'
    if (value.includes(':')) {
      type = 'MAC'
    } else if (value.includes('.')) {
      //no-op.
    }

    let deviceItem = undefined
    if (tag.startsWith('Device')) {
      deviceItem = context.getDevice(value, type)

      if (deviceItem === undefined) {
        //alert("failed to find " + value + " " + type)
      }
    }

    if (tag == 'Interface') {
      return <InterfaceItem name={value} />
    } else if (tag == 'Device') {
      return <DeviceItem show={['Style', 'Name']} item={deviceItem} />
    } else if (tag == 'DeviceIcon') {
      return <DeviceItem show={['Style']} item={deviceItem} />
    } else if (tag == 'DeviceName') {
      return <DeviceItem show={['Name']} item={deviceItem} />
    } else if (tag == 'DeviceIP') {
      return <DeviceItem show={['RecentIP']} item={deviceItem} />
    } else if (tag == 'DeviceMAC') {
      return <DeviceItem show={['MAC']} item={deviceItem} />
    }
  }

  return (
    <Text>
      {value}#{tag}
    </Text>
  )
}

export const eventTemplate = (context, template, event) => {
  if (!template || !event) {
    return template
  }

  let elements = []
  let lastIndex = 0

  const supportTags = Platform.OS == 'web'

  template.replace(
    /\{\{([\w\.]+)(?:#(\w+))?\}\}/g,
    (match, path, tag, index) => {
      // Add the text before the match.
      if (index > lastIndex) {
        elements.push(template.slice(lastIndex, index))
      }

      if (match.includes('__')) {
        // Disable double underscore matches.
        lastIndex = index + match.length
        return ''
      }

      const levels = path.split('.')
      let currentValue = event
      for (let level of levels) {
        if (currentValue && currentValue[level]) {
          currentValue = currentValue[level]
        } else {
          currentValue = ''
          break
        }
      }

      if (tag && supportTags) {
        elements.push(transformTag(context, tag, currentValue))
      } else {
        elements.push(currentValue)
      }

      lastIndex = index + match.length
      return ''
    }
  )

  // Add any remaining text after the last match.
  if (lastIndex < template.length) {
    if (supportTags) {
      elements.push(<Text size="sm">{template.slice(lastIndex)}</Text>)
    } else {
      elements.push(template.slice(lastIndex))
    }
  }

  if (supportTags) {
    return (
      <>
        {elements.map((element, idx) => (
          <React.Fragment key={idx}>{element}</React.Fragment>
        ))}
      </>
    )
  }

  // return string
  return elements.join('')
}
