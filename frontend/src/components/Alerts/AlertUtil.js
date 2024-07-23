import React from 'react'
import { Platform } from 'react-native'
import DeviceItem from 'components/Devices/DeviceItem'

import { InterfaceItem } from 'components/TagItem'

import { HStack, Text } from '@gluestack-ui/themed'

export const transformTag = (context, tag, value, supportTags = true) => {
  if (context) {
    //fuzzymatch if its ip or mac
    let type = 'RecentIP'
    if (value.split(':')?.length == 6) {
      type = 'MAC'
    }

    if (type == 'RecentIP') {
      //.Remote etc have ip:port, skip this
      value = value.replace(/:.*/, '')
    }

    let deviceItem = undefined
    if (tag.startsWith('Device')) {
      deviceItem = context.getDevice(value, type)

      if (deviceItem === undefined) {
        //alert("failed to find " + value + " " + type)
      }
    }

    //translate to string
    if (!supportTags) {
      if (tag.match(/Interface/)) {
        return value
      } else if (tag.match(/IP/)) {
        return deviceItem?.RecentIP || value
      } else if (tag.match(/Device/)) {
        return deviceItem?.Name || value
      }
    }

    if (tag == 'Interface') {
      return <InterfaceItem size="sm" name={value} />
    } else if (tag == 'Device') {
      return <DeviceItem size="sm" show={['Style', 'Name']} item={deviceItem} />
    } else if (tag == 'DeviceIcon') {
      return <DeviceItem size="sm" show={['Style']} item={deviceItem} />
    } else if (tag == 'DeviceName') {
      return <DeviceItem size="sm" show={['Name']} item={deviceItem} />
    } else if (tag == 'DeviceIP') {
      return <DeviceItem size="sm" show={['RecentIP']} item={deviceItem} />
    } else if (tag == 'DeviceMAC') {
      return <DeviceItem size="sm" show={['MAC']} item={deviceItem} />
    } else if (tag == 'Disabled') {
      if (deviceItem === undefined) {
        return <Text> Unknown </Text>
      } else if (deviceItem && deviceItem.Enabled) {
        return <Text> Enabled </Text>
      } else {
        return <Text> Disabled </Text>        
      }
    }
  }

  return (
    <Text>
      {value}#{tag}
    </Text>
  )
}

// if supportTags=false string is returned, else list of react elements
export const eventTemplate = (
  context,
  template,
  event,
  supportTags = false
) => {
  if (!template || !event) {
    return template
  }

  let elements = []
  let lastIndex = 0

  //const supportTags = Platform.OS == 'web'
  const addElement = (val) => {
    if (supportTags) {
      elements.push(<Text size="sm">{val}</Text>)
    } else {
      elements.push(val)
    }
  }

  template.replace(
    /\{\{([\w\.]+)(?:#(\w+))?\}\}/g,
    (match, path, tag, index) => {
      // Add the text before the match.
      if (index > lastIndex) {
        addElement(template.slice(lastIndex, index))
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

      if (tag) {
        addElement(transformTag(context, tag, currentValue, supportTags))
      } else {
        addElement(currentValue)
      }

      lastIndex = index + match.length
      return ''
    }
  )

  // Add any remaining text after the last match.
  if (lastIndex < template.length) {
    addElement(template.slice(lastIndex))
  }

  if (supportTags) {
    return (
      <HStack space="xs" justifyContent="flex-start" flexWrap="wrap">
        {elements.map((element, idx) => (
          <React.Fragment key={idx}>{element}</React.Fragment>
        ))}
      </HStack>
    )
  }

  // return string
  return elements.join('')
}

export const countFields = (result, getEvent) => {
  const counts = {};

  const commons = [
    'SrcIP',
    'DstIP',
    'IP',
    'DstMAC',
    'SrcMAC',
    'SrcPort',
    'DstPort',
    'MAC',
    'FirstAnswer',
    'FirstName'
  ]

  function processEntry(entry, prefix = "") {
    Object.entries(entry).forEach(([field, value]) => {
      let ftl = field.toLowerCase()
      if (!value || value === "") {
        // Skip empty or null values
      } else if (typeof value === "object") {
        // Recursively process nested objects
        processEntry(value, prefix + field + ".");
      } else if (ftl.includes("time") || ftl == "bucket") {
        // Skip fields containing "time"
      } else {
        if (prefix === "" || commons.includes(field)) {
          const key = prefix + field + ":" + value;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    });
  }

  result.forEach((entry) => {
    if (getEvent) {
      processEntry(entry.Event)
    } else {
      processEntry(entry);
    }
  });

  return counts;
}

/*
export const eventTemplateElements = (context, template, event) => {
  return eventTemplate(context, template, event, true)
}

export const eventTemplateString = (context, template, event) => {
  return eventTemplate(context, template, event, false)
}
*/
