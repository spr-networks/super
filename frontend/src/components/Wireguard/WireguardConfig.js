import React from 'react'
import PropTypes from 'prop-types'
import QRCode from 'react-qr-code'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faClone, faFile } from '@fortawesome/free-solid-svg-icons'

import { Box, Button, Icon, HStack, ScrollView, VStack } from 'native-base'

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

  const copy = (data) => navigator.clipboard.writeText(data)
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
    <VStack space={4}>
      <ScrollView
        fontSize="xs"
        style={{ whiteSpace: 'pre-wrap' }}
        borderWidth={1}
        borderColor="muted.200"
        h="10vh"
        p="2"
      >
        {config}
      </ScrollView>

      <HStack space={2} justifyContent="stretch">
        <Button
          flex="1"
          variant="outline"
          colorScheme="primary"
          size="sm"
          leftIcon={<Icon as={FontAwesomeIcon} icon={faClone} />}
          onPress={() => copy(config)}
        >
          Copy
        </Button>

        <Button
          flex="1"
          variant="outline"
          colorScheme="primary"
          size="sm"
          leftIcon={<Icon as={FontAwesomeIcon} icon={faFile} />}
          onPress={() => saveFile(config)}
        >
          Download
        </Button>
      </HStack>

      <Box alignItems="center">
        <QRCode value={config} />
      </Box>
    </VStack>
  )
}

WireguardConfig.propTypes = {
  config: PropTypes.object
}

export default WireguardConfig
