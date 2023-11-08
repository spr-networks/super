/* TODO
 * sort
 * timestamp
 * pagination
 */
import React from 'react'
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

import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import { copy } from 'utils'

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
  const colorMode = useColorMode()

  const prettyEvent = (item) => {
    let hexLines = getPayloadHex(item)

    if (!item.msg) {
      //TODO wrap items in scrollview if > x lines
      //<ScrollView maxHeight={150} borderColor="$muted200" borderWidth="$1"></ScrollView>
      return (
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
      )
    }

    return <Text size="sm">{item.msg}</Text>
  }

  return (
    <ListItem alignItems="flex-start">
      <VStack space="sm" flex={1}>
        {prettyEvent(item)}
        <HStack space="sm">
          {selected == 'log:api' && item.file && item.func ? (
            <Link
              color="$muted500"
              isExternal
              href={githubURL(item.file, selected)}
            >
              <LinkText size="sm">
                {item.file}:{item.func}
              </LinkText>
            </Link>
          ) : null}
        </HStack>
      </VStack>
      <VStack
        space="sm"
        alignItems="flex-end"
        sx={{ '@base': { width: 80 }, '@md': { width: 'auto' } }}
      >
        <Text size="xs" textAlign="right">
          {prettyDate(item.time)}
        </Text>

        <Badge size="md" action={levelToColor(item.level)} variant="outline">
          <BadgeText>{item.level || 'info'}</BadgeText>
        </Badge>
      </VStack>
    </ListItem>
  )
}

export default LogListItem
