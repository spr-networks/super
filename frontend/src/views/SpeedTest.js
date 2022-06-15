import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import {
  faGauge,
  faGaugeHigh,
  faGaugeMed,
  faGaugeSimple,
  faPlay,
  faPause,
  faCirclePlay,
  faCirclePause,
  faDownload,
  faCircleArrowDown,
  faCircleArrowUp
} from '@fortawesome/free-solid-svg-icons'
import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Progress,
  Stack,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

import { API, api } from 'api'
import { AlertContext } from 'AppContext'

const SpeedTest = (props) => {
  const context = useContext(AlertContext)
  const [speedDown, setSpeedDown] = useState(0)
  const [speedUp, setSpeedUp] = useState(0)
  const [percentDown, setPercentDown] = useState(0)
  const [percentUp, setPercentUp] = useState(0)
  const [isRunning, setIsRunning] = useState(false)

  let start = 0

  function onProgress(updown, ev) {
    const now = Date.now()

    let total = ev.total

    if (updown === 'upload') {
      total = binaryData.size
    }

    if (ev.lengthComputable && total) {
      let diff = (now - start) / 1000,
        Bps = ev.loaded / diff

      let mbit = (Bps / 1024 / 1024) * 8
      let percent = (ev.loaded / total) * 100.0
      //let eta = (total - ev.loaded) / Bps

      setSpeedDown(mbit.toFixed(2))
      setPercentDown(percent)
    }

    if (updown === 'upload') {
      percent = 100 - percent
      //TODO
    }
  }

  const startTest = () => {
    if (isRunning) {
      // TODO stop test
      return
    }

    setIsRunning(!isRunning)
    let authHeaders = api.getAuthHeaders()
    let [_start, _end] = [0, 4 * 1024 * 1024] //16mb
    let url = `//spr/speedtest/${_start}-${_end}`

    // TODO NOTE will not work in native
    let req = new XMLHttpRequest()
    start = Date.now()

    req.onprogress = (progEv) => {
      console.log('prog:', progEv)
      onProgress('download', progEv)
    }

    req.onreadystatechange = (reqEv) => {
      if (req.readyState === 4) {
        // ('download', btnEv, reqEv);
        setIsRunning(false)
      }
    }

    // load file avoiding the cache
    req.open('GET', url, true)
    req.setRequestHeader('Authorization', authHeaders)
    req.responseType = 'blob'
    req.send(null)
  }

  let icon = isRunning ? (
    <Icon size="10" icon={faCirclePause} color="muted.300" />
  ) : (
    <Icon size="10" icon={faCirclePlay} color="muted.300" />
  )

  return (
    <View>
      <Heading size="md">Speed Test</Heading>

      <VStack space={4} my={4} p={4} bg="white" rounded="md">
        <HStack space={1} justifyContent="flex-start">
          <IconButton
            onPress={startTest}
            variant="unstyled"
            colorScheme="muted"
            icon={icon}
          />
          <HStack space={1} alignItems="center">
            <Text fontSize="48" color="muted.500">
              {speedDown}
            </Text>
            <Text fontSize="32" color="muted.400">
              mbps
            </Text>
          </HStack>
        </HStack>
        <HStack space={4} mx="4" alignItems="center">
          <Icon icon={faCircleArrowDown} color="muted.500" />
          <Text color="muted.500" w="10%">
            Download
          </Text>
          <Progress
            w="82%"
            size="md"
            rounded="md"
            colorScheme="emerald"
            value={percentDown}
          />
        </HStack>
        {/*<HStack space={4} mx="4" alignItems="center">
          <Icon icon={faCircleArrowUp} color="muted.500" />
          <Text color="muted.500" w="10%">
            Upload
          </Text>
          <Progress
            w="82%"
            size="md"
            rounded="md"
            colorScheme="violet"
            value={percentDown}
          />
        </HStack>*/}
      </VStack>
    </View>
  )
}

export default SpeedTest
