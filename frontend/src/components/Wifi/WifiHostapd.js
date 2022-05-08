import { useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { ucFirst } from 'utils'

import { Box, HStack, Text, VStack, useColorModeValue } from 'native-base'

const WifiHostapd = (props) => {
  const [config, setConfig] = useState({})
  const canEdit = ['ssid', 'channel']

  const sortConf = (conf) => {
    // put the ones we can change at the top
    return Object.keys(conf)
      .sort((a, b) => {
        if (canEdit.includes(a)) {
          return -1
        }

        return a > b ? 1 : a < b ? -1 : 0
      })
      .reduce((obj, key) => {
        obj[key] = conf[key]
        return obj
      }, {})
  }

  useEffect(() => {
    wifiAPI.config().then((conf) => {
      setConfig(sortConf(conf))
    })
  }, [])

  const handleChange = (e) => {
    let name = e.target.name,
      value = e.target.value

    let configNew = { ...config }
    configNew[name] = value

    setConfig(configNew)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    let data = {
      Ssid: config.ssid,
      Channel: parseInt(config.channel)
    }

    wifiAPI.updateConfig(data).then((config) => {
      setConfig(sortConf(config))
    })
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <VStack space={2}>
        {Object.keys(config).map((label) => (
          <HStack space={4} justifyContent="center">
            <Text bold w="1/4" textAlign="right">
              {label}
            </Text>
            <Text w="1/4">{config[label]}</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  )

  /*
      <Text>
        <em>NOTE:</em> Editing hostapd.conf requires restarting the Wifi &amp;
        your connection will be dropped
      </Text>

*/
}

export default WifiHostapd
