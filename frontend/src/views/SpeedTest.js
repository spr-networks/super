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

import { apiURL } from 'api/API'
import { api } from 'api'
import { AlertContext } from 'AppContext'

const SpeedTest = (props) => {
  const context = useContext(AlertContext)
  const [isRunning, setIsRunning] = useState(false)
  const [speedDown, setSpeedDown] = useState(0.0)
  const [percentDown, setPercentDown] = useState(0)
  const [speedUp, setSpeedUp] = useState(0.0)
  const [percentUp, setPercentUp] = useState(0)

  let req = null
  let start = 0
  let postData = null

  function onProgress(updown, ev) {
    console.log(updown, ev)
    const now = Date.now()

    let total = ev.total //updown === 'upload' ? postData.size : ev.total
    let mbit = 0
    let percent = 0

    if (ev.lengthComputable && total) {
      let diff = (now - start) / 1000,
        Bps = ev.loaded / diff

      mbit = (Bps / 1024 / 1024) * 8
      percent = (ev.loaded / total) * 100.0
      //let eta = (total - ev.loaded) / Bps
    }

    if (updown === 'upload') {
      if (ev.loaded < ev.total) {
        setSpeedUp(mbit)
      }

      if (percentUp < 100) {
        console.log('setting', mbit, percent)
        setPercentUp(percent)
      }
    } else {
      if (ev.loaded < ev.total) {
        setSpeedDown(mbit)
      }

      if (percentDown < 100) {
        setPercentDown(percent)
      }
    }
  }

  const startTestUpload = () => {
    if (isRunning) {
      return req.abort()
    }

    setIsRunning(true)
    let authHeaders = api.getAuthHeaders()
    let [_start, _end] = [0, 4 * 1024 * 1024] //16mb

    req = new XMLHttpRequest()
    start = Date.now()

    let apiUrl = apiURL()
    let url = `${apiUrl}speedtest/${_start}-${_end}`

    // compability
    if (req.upload) {
      req.upload.onprogress = (progEv) => {
        onProgress('upload', progEv)
      }

      req.upload.onloadend = (reqEv) => {
        console.log('req.upload.done')
        setIsRunning(false)
      }
    } else {
      req.onprogress = (progEv) => {
        onProgress('upload', progEv)
      }

      req.onreadystatechange = (reqEv) => {
        if (req.readyState === 4) {
          setIsRunning(false)
        }
      }
    }

    // load file avoiding the cache
    req.open('PUT', url, true)
    req.setRequestHeader('Authorization', authHeaders)
    req.setRequestHeader('Content-Type', 'application/octet-stream')

    //postData = new Blob([new Uint8Array(4 * 1024 * 1024)])

    req.send(postData) // send the data we received
  }

  const startTestDownload = () => {
    let authHeaders = api.getAuthHeaders()
    let [_start, _end] = [0, 16 * 1024 * 1024] //16mb

    // TODO NOTE will not work in native
    req = new XMLHttpRequest()
    start = Date.now()

    let apiUrl = apiURL()
    let url = `${apiUrl}speedtest/${_start}-${_end}`

    req.onprogress = (progEv) => {
      onProgress('download', progEv)
    }

    req.onreadystatechange = (reqEv) => {
      if (req.readyState === 4) {
        postData = req.response
        setIsRunning(false)
        startTestUpload()
      }
    }

    // load file avoiding the cache
    req.open('GET', url, true)
    req.setRequestHeader('Authorization', authHeaders)
    req.responseType = 'blob'
    req.send(null)
  }

  const startTest = () => {
    if (isRunning) {
      return req.abort()
    }

    setSpeedDown(0.0)
    setPercentDown(0)
    setSpeedUp(0.0)
    setPercentUp(0)

    setIsRunning(true)

    startTestDownload()
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
        </HStack>
        <HStack space={4} mx="4" alignItems="center">
          <VStack space={1} w="20%">
            <HStack space={2} alignItems="center">
              <Text fontSize="32" color="muted.500">
                {speedDown.toFixed(2)}
              </Text>
              <Text fontSize="24" color="muted.400">
                mbps
              </Text>
            </HStack>

            <HStack space={1}>
              <Icon icon={faCircleArrowDown} color="muted.500" />
              <Text color="muted.500">Download</Text>
            </HStack>
          </VStack>
          <Progress
            w="70%"
            size="md"
            rounded="md"
            colorScheme="emerald"
            value={percentDown}
          />
        </HStack>
        <HStack space={4} mx="4" alignItems="center">
          <VStack space={1} w="20%">
            <HStack space={2} alignItems="center">
              <Text fontSize="32" color="muted.500" textAlign="right">
                {speedUp.toFixed(2)}
              </Text>
              <Text fontSize="24" color="muted.400">
                mbps
              </Text>
            </HStack>
            <HStack space={2} alignItems="center">
              <Icon icon={faCircleArrowUp} color="muted.500" />
              <Text color="muted.500">Upload</Text>
            </HStack>
          </VStack>

          <Progress
            w="70%"
            size="md"
            rounded="md"
            colorScheme="violet"
            value={percentUp}
          />
        </HStack>
      </VStack>
    </View>
  )
}

export default SpeedTest
