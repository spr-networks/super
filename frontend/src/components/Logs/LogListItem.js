/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useContext } from 'react'
import { prettyDate } from 'utils'
import { Buffer } from 'buffer'
import { JSONSyntax, HEXSyntax } from 'components/SyntaxHighlighter'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  Link,
  HStack,
  VStack,
  Text,
  LinkText,
  useColorMode,
  CopyIcon,
  ScrollView
} from '@gluestack-ui/themed'

import { AppContext } from 'AppContext'
import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import { copy } from 'utils'
import { InterfaceItem } from 'components/TagItem'

//utils
const levelToColor = (level) => {
  let levels = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    success: 'success'
  }
  return levels[level] || 'muted'
}

//skip some properties
const dumpJSON = (item, clean = false) => {
  let { time, bucket, ...rest } = item
  if (clean) {
    return JSON.stringify(rest, null, 2)
  }

  return JSON.stringify(rest)
}

//TODO support other containers
//NOTE this will not work if running an older version
const githubURL = (filename, bucket) => {
  if (
    bucket != 'log:api' ||
    !filename.match(/^[a-z0-9\/_]+.go:[0-9]+$/gi, '')
  ) {
    return null
  }

  let containerDir = 'api'
  let url = `https://github.com/spr-networks/super/blob/main/${containerDir}/`
  filename = filename.replace(':', '#L') // line no
  return url + filename
}

const formatHexString = (buffer) => {
  let hexString = ''
  let asciiString = ''
  let resultString = ''

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i]
    hexString += byte.toString(16).padStart(2, '0')
    asciiString += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
    if (i % 8 === 7) hexString += '  '

    if (i % 16 === 15) {
      resultString += hexString + ' |' + asciiString + '|\n'
      hexString = ''
      asciiString = ''
    } else {
      hexString += ' '
    }
  }

  if (hexString) {
    const remainingBytes = buffer.length % 16
    if (remainingBytes <= 8) {
      hexString += ' '.repeat((8 - remainingBytes) * 3 + 1)
    } else {
      hexString += ' '.repeat((16 - remainingBytes) * 3)
    }
    resultString += hexString + '  | ' + asciiString
  }

  return resultString //.trimEnd();
}

const getPayloadHex = (obj) => {
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (key === 'Payload' && typeof obj[key] === 'string') {
        const buffer = Buffer.from(obj[key], 'base64')
        const hexString = formatHexString(buffer)
        return hexString
      } else if (typeof obj[key] === 'object') {
        let ret = getPayloadHex(obj[key])
        if (ret) {
          return ret
        }
      }
    }
  }
  return null
}

const LogListItem = ({ item, selected, ...props }) => {
  const context = useContext(AppContext)

  const prettyEvent = (item, selected) => {
    let hexLines = false //getPayloadHex(item)

    //TODO make a component of this
    const DeviceItem = React.memo(({ item, ...props }) => {
      return (
        <Text size="md" bold>
          {item?.Name}
        </Text>
      )
    })

    //TODO component

    const niceEvent = (event) => {
      let events = {
        'AP-STA-CONNECTED': 'connect',
        'AP-STA-DISCONNECTED': 'disconnect'
      }

      return events[event] || event
    }

    const wifiSta = () => (
      <>
        <HStack space="md" alignItems="center">
          <InterfaceItem name={item.Iface} />
          <DeviceItem item={context.getDevice(item.MAC)}></DeviceItem>
          <Text size="md">{niceEvent(item.Event)}</Text>
          {['Router', 'Status'].map((f) =>
            item[f]?.length ? (
              <HStack space="sm">
                <Text size="sm" bold>
                  {f}
                </Text>
                <Text size="sm">{item[f]}</Text>
              </HStack>
            ) : null
          )}
        </HStack>
      </>
    )

    const eventParsers = {
      'log:api': (item) => (
        <>
          <Text size="sm">{item.msg}</Text>
          {item.file && item.func ? (
            <HStack space="sm">
              <Badge
                size="md"
                action={levelToColor(item.level)}
                variant="outline"
              >
                <BadgeText>{item.level || 'info'}</BadgeText>
              </Badge>
              <Link
                color="$muted500"
                isExternal
                href={githubURL(item.file, selected)}
              >
                <LinkText size="sm">
                  {item.file}:{item.func}
                </LinkText>
              </Link>
            </HStack>
          ) : null}
        </>
      ),
      'dhcp:request': (item) => (
        <HStack space="xl" gap="$8" alignItems="center">
          <InterfaceItem name={item.Iface} />
          <DeviceItem item={context.getDevice(item.MAC, 'MAC')} />
          {['Identifier', 'Name'].map((t) =>
            item[t] ? (
              <HStack space="sm">
                <Text size="sm" color="$muted500">
                  {t}
                </Text>
                <Text size="sm">{item[t]}</Text>
              </HStack>
            ) : null
          )}
        </HStack>
      ),
      'dhcp:response': (item) => (
        <HStack space="xl" gap="$8" alignItems="center">
          <DeviceItem item={context.getDevice(item.IP, 'RecentIP')} />
          {['LeaseTime', 'DNSIP', 'RouterIP'].map((t) =>
            item[t] ? (
              <HStack space="sm">
                <Text size="sm" color="$muted500">
                  {t}
                </Text>
                <Text size="sm">{item[t]}</Text>
              </HStack>
            ) : null
          )}
        </HStack>
      ),

      'dns:block:event': (item) => (
        <HStack space="sm">
          <DeviceItem item={context.getDevice(item.ClientIP, 'RecentIP')} />
          <Text size="md">block</Text>
          <Text size="md">{item.Name}</Text>
        </HStack>
      ),
      'wifi:station:disconnect': wifiSta,
      'wifi:auth:success': wifiSta,
      'www:auth:user:success': (item) => (
        <HStack space="sm">
          <Text size="md" bold>
            {item.username}
          </Text>
          <Text size="md">login</Text>
        </HStack>
      )
    }

    if (eventParsers[selected]) {
      return eventParsers[selected](item)
    }

    if (!item.msg) {
      //TODO wrap items in scrollview if > x lines

      return (
        <ScrollView maxHeight={150} borderColor="$muted200" borderWidth="$1">
          <VStack
            space="md"
            alignItems="flex-end"
            sx={{ '@md': { flexDirection: 'row', alignItems: 'flex-start' } }}
          >
            <JSONSyntax>{dumpJSON(item, true)}</JSONSyntax>

            <Tooltip label="Copy JSON">
              <Button
                action="primary"
                variant="link"
                size="xs"
                display={item.msg ? 'none' : 'flex'}
                onPress={() => copy(JSON.stringify(item))}
                position="sticky"
                sx={{
                  '@base': { right: '$0', marginTop: '-$10 ' },
                  '@md': {
                    right: hexLines ? '$1/2' : '$0',
                    marginRight: '$10',
                    marginTop: '$0'
                  }
                }}
              >
                <ButtonIcon as={CopyIcon} ml="$1" />
              </Button>
            </Tooltip>

            {hexLines ? <HEXSyntax>{hexLines}</HEXSyntax> : null}
          </VStack>
        </ScrollView>
      )
    }

    return <Text size="sm">{item.msg}</Text>
  }

  return (
    <ListItem alignItems="flex-start" flexDirection="column">
      <HStack
        space="sm"
        alignItems="flex-end"
        sx={{ '@base': { width: 80 }, '@md': { width: 'auto' } }}
      >
        <Text size="xs" textAlign="right">
          {prettyDate(item.time)}
        </Text>
      </HStack>
      <VStack space="sm" w="$full">
        {prettyEvent(item, selected)}
      </VStack>
    </ListItem>
  )
}

export default LogListItem
