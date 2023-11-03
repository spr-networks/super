import React from 'react'
import { Platform } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import PropTypes from 'prop-types'
import QRCode from 'react-qr-code'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  ScrollView,
  Text,
  VStack,
  CopyIcon
} from '@gluestack-ui/themed'

import { FileIcon } from 'lucide-react-native'

const WireguardConfig = (props) => {
  if (!props.config) {
    return <></>
  }

  // TODO - separate stage to its own file
  const configFromJSON = (data) => {
    return `[Interface]
      PrivateKey = ${data.Interface.PrivateKey || '<PRIVATE KEY>'}
      Address = ${data.Interface.Address}
      DNS = ${data.Interface.DNS}
      
      [Peer]
      PublicKey = ${data.Peer.PublicKey}
      AllowedIPs = ${data.Peer.AllowedIPs}
      Endpoint = ${data.Peer.Endpoint}
      PersistentKeepalive = ${data.Peer.PersistentKeepalive}
      ${
        data.Peer.PresharedKey ? 'PresharedKey = ' + data.Peer.PresharedKey : ''
      }
    `
      .replace(/(  +)/g, '')
      .trim()
  }

  let config = configFromJSON(props.config)

  // if web requires secure context
  const showClipboard = true //Platform.OS !== 'web' || navigator.clipboard
  const copy = (data) => {
    if (Platform.OS == 'web') {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data)
      } else {
        var copyTextarea = document.createElement('textarea')
        copyTextarea.style.position = 'fixed'
        copyTextarea.style.opacity = '0'
        copyTextarea.textContent = data

        document.body.appendChild(copyTextarea)
        copyTextarea.select()
        document.execCommand('copy')
        document.body.removeChild(copyTextarea)
      }
    } else {
      Clipboard.setString(data)
    }
  }

  const saveFile = (data) => {
    let filename = 'peer.conf',
      type = 'conf'

    let file = new Blob([data], { type: type })
    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(file, filename) // IE10+
    } else {
      var a = document.createElement('a'),
        url = URL.createObjectURL(file)
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(function () {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 0)
    }
  }

  return (
    <VStack space="md">
      <ScrollView
        style={{ whiteSpace: 'pre-wrap' }}
        borderWidth={1}
        borderColor="$muted200"
        sx={{
          '@base': { height: '$1/2' },
          '@md': { height: '$1/4' }
        }}
        p="$2"
      >
        <Text size="xs">{config}</Text>
      </ScrollView>

      <HStack space="md" justifyContent="space-between">
        <Button
          flex={1}
          action="primary"
          variant="outline"
          size="sm"
          onPress={() => copy(config)}
          display={showClipboard ? 'flex' : 'none'}
        >
          <ButtonText>Copy</ButtonText>
          <ButtonIcon as={CopyIcon} ml="$1" />
        </Button>

        <Button
          flex={1}
          action="primary"
          variant="outline"
          size="sm"
          onPress={() => saveFile(config)}
        >
          <ButtonText>Download</ButtonText>
          <ButtonIcon as={FileIcon} ml="$1" />
        </Button>
      </HStack>

      <Box bg="white" p="$4" justifySelf="center">
        <QRCode value={config} />
      </Box>
    </VStack>
  )
}

WireguardConfig.propTypes = {
  config: PropTypes.object
}

export default WireguardConfig
