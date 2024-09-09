/* TODO
 * sort
 * timestamp
 * pagination
 */
import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
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
  Icon,
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
import { InterfaceItem, ProtocolItem } from 'components/TagItem'
import DeviceItem from 'components/Devices/DeviceItem'
import {
  ArrowRightIcon,
  FileJsonIcon,
  Maximize2Icon
} from 'lucide-react-native'
import { useNavigate } from 'react-router-native'

const redColor = '#C70039'

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

/*
const LogListItem = ({ item, selectedBuckets }) => {
  const isSelected = selectedBuckets.some(bucket => item.bucket.startsWith(bucket));

  return (
    <View style={isSelected ? styles.selectedItem : styles.item}>
      <Text>{item.time}</Text>
      <Text>{item.msg}</Text>
      <Text>{item.bucket}</Text>
      <Text>{item.level}</Text>
    </View>
  );
};
*/
const PrettyItem = ({ item, selected, showJSON, setIsParsable, ...props }) => {
  const context = useContext(AppContext)
  const navigate = useNavigate()

  if (selected.startsWith('dns:serve:')) {
    selected = 'dns:serve:'
  }

  const [maxHeight, setMaxHeight] = useState(150)

  const niceEvent = (event) => {
    let events = {
      'AP-STA-CONNECTED': 'connect',
      'AP-STA-DISCONNECTED': 'disconnect'
    }

    return events[event] || event
  }

  let remoteIP = 'no'
  if (item?.Remote) {
    remoteIP = item.Remote.split(':')[0]
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
        <DeviceItem
          show={['Style', 'Name']}
          flex={1}
          item={context.getDevice(item.MAC, 'MAC')}
        />

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
        <DeviceItem
          show={['Style', 'Name']}
          flex={1}
          item={context.getDevice(item.IP, 'RecentIP')}
        />
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
      <VStack
        space="md"
        sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
        w="$full"
      >
        <HStack flex={1} space="md" alignItems="center">
          <DeviceItem
            show={['Style', 'Name']}
            item={context.getDevice(remoteIP, 'RecentIP')}
          />
        </HStack>
        <VStack
          flex={2}
          space="sm"
          sx={{
            '@md': { flexDirection: 'row', justifyContent: 'space-between' }
          }}
        >
          <Text
            size="md"
            bold
            onPress={() =>
              navigate(`/admin/dnsLog/${remoteIP}/${item.FirstName}`)
            }
          >
            {item.FirstName}
          </Text>
          <Text size="md">{item.FirstAnswer}</Text>
        </VStack>
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
        <DeviceItem
          show={['Style', 'Name']}
          flex={1}
          item={context.getDevice(item.MAC)}
        />
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
        <HStack flex={1} justifyContent="space-between">
          <DeviceItem
            show={['Style', 'Name']}
            hideMissing={true}
            item={context.getDevice(item.MAC)}
          />
          <Text>{item.MAC}</Text>
          <Text>{item.Reason}</Text>
          <Text>{item.Type}</Text>
        </HStack>
      </>
    ),
    'auth:success': (item) => (
      <>
        <Text flex={1} size="md" bold>
          {item.username || item.name}
        </Text>
        <Text size="md">{item.type}</Text>
        <Text size="md">{item.reason}</Text>
      </>
    ),
    'auth:failure': (item) => (
      <>
        <Text flex={1} size="md" bold>
          {item.username || item.name}
        </Text>
        <Text size="md">{item.type}</Text>
        <Text size="md">{item.reason}</Text>
        <Text size="md">failure</Text>
      </>
    ),
    'log:www:access': (item) => (
      <>
        <HStack space="md">
          <Text size="md" bold>
            {item.method}
          </Text>
          <Text size="md">{item.path}</Text>
        </HStack>
        <DeviceItem
          show={['Style', 'Name']}
          hideMissing={false}
          item={context.getDevice(
            item.remoteaddr.replace(/:.*/, ''),
            'RecentIP'
          )}
        />
      </>
    ),
    'nft:drop:private': (item) => <NFTDropItem item={item} type="private" />,
    'nft:drop:forward': (item) => <NFTDropItem item={item} type="forward" />,
    'nft:drop:mac': (item) => <NFTDropItem item={item} type="mac" />,
    'nft:drop:input': (item) => <NFTDropItem item={item} type="input" />
  }

  const NFTDropItem = ({ item, type, ...props }) => {
    let srcPort = item?.TCP?.SrcPort || item?.UDP?.SrcPort || null
    let dstPort = item?.TCP?.DstPort || item?.UDP?.DstPort || null
    let proto = ''
    if (item.TCP) {
      proto = 'tcp'
    } else if (item.UDP) {
      proto = 'udp'
    }

    const desktopOnly = {
      display: 'none',
      sx: {
        '@md': {
          display: 'flex'
        }
      }
    }

    return (
      <VStack
        flex={1}
        justifyContent="space-between"
        space="md"
        sx={{ '@md': { flexDirection: 'row' } }}
      >
        <HStack flex={1} space="md" alignItems="center">
          <DeviceItem
            show={['Style', 'Name']}
            flex={1}
            hideMissing={false}
            item={context.getDevice(item.Ethernet?.SrcMAC)}
          />
          <HStack space="sm">
            <InterfaceItem name={item.InDev} {...desktopOnly} />
            <ProtocolItem name={proto} size="sm" />
            <HStack>
              <Text size="sm" bold>
                {item.IP?.SrcIP}
              </Text>
              {srcPort ? <Text size="sm">:{srcPort}</Text> : null}
            </HStack>
          </HStack>
        </HStack>

        <HStack mx="$4" alignItems="center" justifyContent="center">
          <Icon as={ArrowRightIcon} color="$muted500" />
        </HStack>

        <HStack
          flex={1}
          space="sm"
          alignItems="center"
          justifyContent="space-between"
        >
          <HStack flex={1} space="sm">
            {/*<ProtocolItem name={proto} size="sm" />*/}
            <HStack>
              <Text size="sm" bold>
                {item.IP?.DstIP}
              </Text>
              {dstPort ? <Text size="sm">:{dstPort}</Text> : null}
            </HStack>
            <InterfaceItem {...desktopOnly} name={item.OutDev} />
          </HStack>
          <DeviceItem
            show={['Style', 'Name']}
            flex={1}
            hideMissing={true}
            item={context.getDevice(item.Ethernet?.DstMAC)}
          />
        </HStack>
      </VStack>
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
        space="3xl"
        alignItems="center"
        p="$4"
        justifyContent="space-between"
        {...props}
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
        {...props}
      >
        {Platform.OS == 'web' ? (
          <>
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
          </>
        ) : (
          <Text size="xs">{jsonData}</Text>
        )}
      </ScrollView>
    )
  }
}

const LogListItemHeader = ({
  item,
  TitleComponent,
  isParsable,
  showJSON,
  setShowJSON,
  ...props
}) => {
  return (
    <HStack
      w="$full"
      bg="$coolGray100"
      sx={{
        _dark: { bg: '$secondary950' }
      }}
      alignItems="center"
      px="$4"
      py="$0.5"
      space="md"
    >
      {TitleComponent || (
        <Text size="xs" bold>
          {prettyDate(item.Timestamp || item.time)}
        </Text>
      )}

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
          >
            <ButtonIcon as={CopyIcon} />
          </Button>
        </Tooltip>
      </ButtonGroup>
    </HStack>
  )
}

const LogListItem = ({
  item,
  isHidden,
  selected,
  TitleComponent,
  children,
  onPress,
  ...props
}) => {
  const [isParsable, setIsParsable] = useState(true)
  const [showJSON, setShowJSON] = useState(false)

  useEffect(() => {
    setShowJSON(!isParsable)
  }, [isParsable])

  const showHeader = true

  const hookSetShowJSON = (v) => {
    setShowJSON(v)
    if (onPress) {
      onPress('json', v)
    }
  }

  if (!item) return <></>

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
      {...props}
    >
      {showHeader ? (
        <LogListItemHeader
          item={item}
          isParsable={isParsable}
          showJSON={showJSON}
          setShowJSON={hookSetShowJSON}
          TitleComponent={TitleComponent}
        ></LogListItemHeader>
      ) : null}
      <HStack w="$full">
        <PrettyItem
          item={item}
          selected={selected}
          showJSON={showJSON}
          setIsParsable={setIsParsable}
          flex={1}
          display={isHidden ? 'none' : 'flex'}
        />
        {children ? children : null}
      </HStack>
    </ListItem>
  )
}

export default LogListItem

export { LogListItem, LogListItemHeader }
