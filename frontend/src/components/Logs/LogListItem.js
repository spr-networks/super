/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useContext, useEffect, useState } from 'react'
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
  CopyIcon,
  ScrollView,
  ButtonGroup
} from '@gluestack-ui/themed'

import { AppContext } from 'AppContext'
import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import { copy } from 'utils'
import { InterfaceItem } from 'components/TagItem'
import DeviceItem from 'components/Devices/DeviceItem'
import { ArrowBigRightIcon, FileJsonIcon, Maximize2Icon } from 'lucide-react-native'
import { useNavigate } from 'react-router-native'

const redColor = "#C70039"

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

const PrettyItem = ({ item, selected, showJSON, setIsParsable, ...props }) => {
  const context = useContext(AppContext)
  const navigate = useNavigate()

  if (selected.startsWith("dns:serve:")) {
    selected = "dns:serve:"
  }

  const [maxHeight, setMaxHeight] = useState(150)

  const niceEvent = (event) => {
    let events = {
      'AP-STA-CONNECTED': 'connect',
      'AP-STA-DISCONNECTED': 'disconnect'
    }

    return events[event] || event
  }

  let srcPort =  item?.TCP?.SrcPort || item?.UDP?.SrcPort || null;
  let dstPort =  item?.TCP?.DstPort || item?.UDP?.DstPort || null;
  let proto = ""
  if (item.TCP) {
    proto = "tcp"
  } else if (item.UDP) {
    proto = "udp"
  }

  let remoteIP = "no"
  if (item.Remote) {
    remoteIP = item.Remote.split(":")[0]
  }

  const eventParsers = {
    'log:api': (item) => (
      <VStack space="md">
        <Text size="sm">{item.msg}</Text>
        {item.file && item.func ? (
          <HStack space="sm">
            <Badge
              size="sm"
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
      </VStack>
    ),
    'dhcp:request': (item) => (
      <>
        <DeviceItem flex={1} item={context.getDevice(item.MAC, 'MAC')} />

        {['Identifier', 'Name'].map((t) =>
          item[t] ? (
            <HStack
              space="sm"
              display="none"
              sx={{ '@md': { display: 'flex' } }}
            >
              <Text size="sm" color="$muted500">
                {t}
              </Text>
              <Text size="sm">{item[t]}</Text>
            </HStack>
          ) : null
        )}
        <InterfaceItem name={item.Iface} />
      </>
    ),
    'dhcp:response': (item) => (
      <>
        <DeviceItem flex={1} item={context.getDevice(item.IP, 'RecentIP')} />
        {['LeaseTime', 'DNSIP', 'RouterIP'].map((t) =>
          item[t] ? (
            <HStack
              space="sm"
              display="none"
              sx={{ '@md': { display: 'flex' } }}
            >
              <Text size="sm" color="$muted500">
                {t}
              </Text>
              <Text size="sm">{item[t]}</Text>
            </HStack>
          ) : null
        )}
      </>
    ),
    'dns:serve:': (item) => (
      <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }} w="$full">
        <HStack flex={1} space="md" justifyContent="space-between" alignItems="center">
          <DeviceItem
            show={['Style', 'Name']}
            item={context.getDevice(remoteIP, 'RecentIP')}
          />
          <Text
            size="md"
            bold
            onPress={() =>
              navigate(`/admin/dnsLog/${remoteIP}/${item.FirstName}`)
            }
          >
            {item.FirstName}
          </Text>
          <Text size="md">
          {item.FirstAnswer}
          </Text>
        </HStack>
      </VStack>
    ),
    'dns:block:event': (item) => (
      <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }} w="$full">
        <DeviceItem
          flex={1}
          item={context.getDevice(item.ClientIP, 'RecentIP')}
        />
        <HStack space="md" justifyContent="space-between" alignItems="center">
          <Text
            size="md"
            bold
            onPress={() =>
              navigate(`/admin/dnsLog/${item.ClientIP}/${item.Name}`)
            }
          >
            {item.Name}
          </Text>
          <Text size="md">block</Text>
        </HStack>
      </VStack>
    ),
    'wifi:auth:success': () => (
      <>
        <DeviceItem flex={1} item={context.getDevice(item.MAC)} />
        {['Router', 'Status'].map((f) =>
          item[f]?.length ? (
            <HStack
              space="sm"
              display="none"
              sx={{ '@md': { display: 'flex' } }}
            >
              <Text size="sm" bold>
                {f}
              </Text>
              <Text size="sm">{item[f]}</Text>
            </HStack>
          ) : null
        )}
        <Text size="md" display="none" sx={{ '@md': { display: 'flex' } }}>
          {niceEvent(item.Event)}
        </Text>
        <InterfaceItem name={item.Iface} />
      </>
    ),
    'wifi:auth:fail': () => (
      <>
        <HStack flex={1}  justifyContent="space-between">
          <DeviceItem hideMissing={true} item={context.getDevice(item.MAC)} />
          <Text>{item.MAC}</Text>
          <Text>{item.Reason}</Text>
          <Text>{item.Type}</Text>
        </HStack>
      </>
    ),
    'auth:success': (item) => (
      <>
        <Text size="md" bold>
          {item.username||item.token}
        </Text>
        <Text size="md">
          {item.type}
        </Text>
        <Text size="md">{item.reason}</Text>
      </>
    ),
    'auth:failure': (item) => (
      <>
        <Text size="md" bold>
          {item.username||item.token}
        </Text>
        <Text size="md">
          {item.type}
        </Text>
        <Text size="md">
          {item.reason}
        </Text>
        <Text size="md">failure</Text>
      </>
    ),
    'nft:drop:private': (item) => (
      <>
      <HStack flex={1} justifyContent="space-between">
        <VStack>
          <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet?.SrcMAC)} />
          <Text size="md" bold>{item.Ethernet?.SrcMAC}  </Text>
          <Text size="md" bold>{item.IP.SrcIP}</Text>
          {(srcPort ?
              <VStack>
                <Text size="md" bold>{proto}</Text>
                <Text size="md" bold>{srcPort}</Text>
              </VStack>
            : null)}
          <Text size="md" bold>{item.InDev}</Text>
        </VStack>
        <ArrowBigRightIcon/>
        <VStack>
          <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.DstMAC)} />
          <Text size="md" bold>{item.Ethernet.DstMAC}</Text>
          <Text size="md" bold style={{ color: redColor }}>{item.IP.DstIP}</Text>
          {(dstPort ?
              <VStack>
                <Text size="md" bold>{proto}</Text>
                <Text size="md" bold>{dstPort}</Text>
              </VStack>
            : null)}
          <Text size="md" bold>{item.OutDev}</Text>
        </VStack>
      </HStack>
      </>
    ),
    'nft:drop:forward': (item) => (
      <>
      <HStack flex={1} justifyContent="space-between">
        <VStack>
          <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet?.SrcMAC)} />
          <Text size="md" bold>{item.Ethernet?.SrcMAC}  </Text>
          <Text size="md" bold>{item.IP.SrcIP}</Text>
          {(srcPort ?
              <VStack>
                <Text size="md" bold>{proto}</Text>
                <Text size="md" bold>{srcPort}</Text>
              </VStack>
            : null)}
          <Text size="md" bold>{item.InDev}</Text>
        </VStack>
        <ArrowBigRightIcon/>
        <VStack>
          <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.DstMAC)} />
          <Text size="md" bold>{item.Ethernet.DstMAC}</Text>
          <Text size="md" bold>{item.IP.DstIP}</Text>
          {(dstPort ?
              <VStack>
                <Text size="md" bold>{proto}</Text>
                <Text size="md" bold>{dstPort}</Text>
              </VStack>
            : null)}
          <Text size="md" bold>{item.OutDev}</Text>
        </VStack>
      </HStack>
      </>
    ),
    'nft:drop:mac': (item) => (
      <>
        <HStack flex={1} justifyContent="space-between">
          <VStack>
            <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.SrcMAC)} />
            <Text size="md" bold style={{ color: redColor }}>{item.Ethernet.SrcMAC}  </Text>
            <Text size="md" bold style={{ color: redColor }}>{item.IP.SrcIP}</Text>
            {(srcPort ?
                <VStack>
                  <Text size="md" bold>{proto}</Text>
                  <Text size="md" bold>{srcPort}</Text>
                </VStack>
              : null)}
            <Text size="md" bold>{item.InDev}</Text>
          </VStack>
          <ArrowBigRightIcon/>
          <VStack>
            <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.DstMAC)} />
            <Text size="md" bold>{item.Ethernet.DstMAC}</Text>
            <Text size="md" bold>{item.IP.DstIP}</Text>
            {(dstPort ?
                <VStack>
                  <Text size="md" bold>{proto}</Text>
                  <Text size="md" bold>{dstPort}</Text>
                </VStack>
              : null)}
            <Text size="md" bold>{item.OutDev}</Text>
          </VStack>
        </HStack>
      </>
    ),
      'nft:drop:input': (item) => (
        <>
        <HStack flex={1} justifyContent="space-between">
          <VStack>
            <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.SrcMAC)} />
            <Text size="md" bold>{item.IP.SrcIP}</Text>
            {(srcPort ?
                <VStack>
                  <Text size="md" bold>{proto}</Text>
                  <Text size="md" bold>{srcPort}</Text>
                </VStack>
              : null)}
            <Text size="md" bold>{item.InDev}</Text>
          </VStack>
          <ArrowBigRightIcon/>
          <VStack>
            <DeviceItem flex={1} hideMissing={true} item={context.getDevice(item.Ethernet.DstMAC)} />
            <Text size="md" bold>{item.IP.DstIP}</Text>
            {(dstPort ?
                <VStack>
                  <Text size="md" bold style={{ color: redColor }}>{proto}</Text>
                  <Text size="md" bold style={{ color: redColor }}>{dstPort}</Text>
                </VStack>
              : null)}
            <Text size="md" bold>{item.OutDev}</Text>
          </VStack>
        </HStack>
        </>
    )
  }
  eventParsers['wifi:station:disconnect'] = eventParsers['wifi:auth:success']

  useEffect(() => {
    setIsParsable(eventParsers[selected] !== undefined)
  }, [])

  let hexLines = getPayloadHex(item)

  if (!showJSON && eventParsers[selected]) {
    return (
      <HStack
        w="$full"
        space="3xl"
        alignItems="center"
        p="$4"
        justifyContent="space-between"
      >
        {eventParsers[selected](item)}
      </HStack>
    )
  } else {
    let jsonData = dumpJSON(item, true)
    let numLines = jsonData.split('\n').length
    return (
      <ScrollView
        maxHeight={maxHeight}
        borderColor="$secondary200"
        sx={{ _dark: { borderColor: '$secondary700' } }}
        borderWidth="$0"
        w="$full"
      >
        <JSONSyntax code={jsonData} />
        {hexLines ? <HEXSyntax code={hexLines} /> : null}
        <Button
          action="secondary"
          variant="link"
          size="xs"
          position="absolute"
          right="$4"
          onPress={() => {
            setMaxHeight(maxHeight == '$full' ? 150 : '$full')
          }}
          isDisabled={numLines <= 8}
        >
          <ButtonIcon as={Maximize2Icon} color="$muted500" />
        </Button>
      </ScrollView>
    )
  }
}

const LogListItem = ({ item, selected, ...props }) => {
  const [isParsable, setIsParsable] = useState(true)
  const [showJSON, setShowJSON] = useState(false)

  useEffect(() => {
    setShowJSON(!isParsable)
  }, [isParsable])

  return (
    <ListItem
      alignItems="flex-start"
      flexDirection="column"
      p="$0"
      bg="$coolGray50"
      borderColor="$secondary200"
      sx={{
        _dark: { bg: '$secondary900', borderColor: '$secondary800' }
      }}
      space="$0"
    >
      <HStack
        w="$full"
        bg="$coolGray100"
        sx={{
          _dark: { bg: '$secondary950' }
        }}
        alignItems="center"
        px="$4"
      >
        <Text size="xs" bold>
          {prettyDate(item.Timestamp || item.time)}
        </Text>
        <ButtonGroup ml="auto" space="md">
          <Tooltip label="Toggle JSON data">
            <Button
              action="primary"
              variant="link"
              size="sm"
              onPress={() => setShowJSON(!showJSON)}
              isDisabled={!isParsable}
            >
              <ButtonIcon as={FileJsonIcon} />
            </Button>
          </Tooltip>

          <Tooltip label="Copy JSON event">
            <Button
              action="primary"
              variant="link"
              size="sm"
              onPress={() => copy(JSON.stringify(item))}
              {...props}
            >
              <ButtonIcon as={CopyIcon} />
            </Button>
          </Tooltip>
        </ButtonGroup>
      </HStack>

      <PrettyItem
        item={item}
        selected={selected}
        showJSON={showJSON}
        setIsParsable={setIsParsable}
      />
    </ListItem>
  )
}

export default LogListItem
