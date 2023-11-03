import React, { useContext, useState } from 'react'

import {
  Button,
  ButtonIcon,
  HStack,
  Icon,
  Progress,
  ProgressFilledTrack,
  Text,
  View,
  VStack
} from '@gluestack-ui/themed'

import {
  PlayIcon,
  PauseIcon,
  ArrowUpCircleIcon,
  ArrowDownCircleIcon
} from 'lucide-react-native'

import { getApiURL } from 'api/API'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { ListHeader } from 'components/List'

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
    //console.log(updown, ev)
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

      setPercentUp(percent)
    } else {
      if (ev.loaded < ev.total) {
        setSpeedDown(mbit)
      }

      setPercentDown(percent)
    }
  }

  const startTestUpload = async () => {
    if (isRunning) {
      return req.abort()
    }

    setIsRunning(true)
    let authHeaders = await api.getAuthHeaders()
    let [_start, _end] = [0, 4 * 1024 * 1024] //16mb

    req = new XMLHttpRequest()
    start = Date.now()

    let apiUrl = getApiURL()
    let url = `${apiUrl}speedtest/${_start}-${_end}`

    // compability
    if (req.upload) {
      req.upload.onprogress = (progEv) => {
        onProgress('upload', progEv)
      }

      req.upload.onloadend = (reqEv) => {
        //console.log('req.upload.done')
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

  const startTestDownload = async () => {
    let authHeaders = await api.getAuthHeaders()
    let [_start, _end] = [0, 16 * 1024 * 1024] //16mb

    // TODO NOTE will not work in native
    req = new XMLHttpRequest()
    start = Date.now()

    let apiUrl = getApiURL()
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
    if (isRunning && req) {
      return req.abort()
    }

    setSpeedDown(0.0)
    setPercentDown(0.0)
    setSpeedUp(0.0)
    setPercentUp(0.0)

    setIsRunning(true)

    startTestDownload()
  }

  return (
    <View>
      <ListHeader
        title="Speed Test"
        description="This test measures http request time to spr. Use iperf3 for more exact results"
      ></ListHeader>

      <VStack
        space="xl"
        bg="$backgroundCardLight"
        sx={{
          _dark: {
            bg: '$backgroundCardDark'
          }
        }}
        p="$4"
        pb="$12"
      >
        <HStack space="sm" p="$4">
          <Button
            action="primary"
            variant="solid"
            rounded="$full"
            size="xl"
            onPress={startTest}
          >
            <ButtonIcon as={isRunning ? PauseIcon : PlayIcon} size="xl" />
          </Button>
        </HStack>

        <VStack space="md" mx="$4" sx={{ '@md': { w: '$1/3' } }}>
          <VStack
            space="sm"
            sx={{ '@base': { w: '$1/2', '@md': { w: '$1/5' } } }}
          >
            <HStack w={200} space="md" alignItems="center">
              <Text size="4xl" color="$muted500">
                {speedDown.toFixed(2)}
              </Text>
              <Text size="xl" color="$muted400">
                mbps
              </Text>
            </HStack>
          </VStack>

          <HStack space="md" alignItems="center" justifyContent="space-between">
            <HStack flex={1} space="sm">
              <Icon as={ArrowDownCircleIcon} color="$muted500" />
              <Text color="$muted500">Download</Text>
            </HStack>
            <Progress flex={2} size="md" rounded="md" value={percentDown}>
              <ProgressFilledTrack />
            </Progress>
          </HStack>
        </VStack>

        <VStack space="md" mx="$4" sx={{ '@md': { w: '$1/3' } }}>
          <VStack
            space="md"
            sx={{ '@base': { w: '$1/2', '@md': { w: '$1/5' } } }}
          >
            <HStack w={200} space="md" alignItems="center">
              <Text size="4xl" color="$muted500">
                {speedUp.toFixed(2)}
              </Text>
              <Text size="xl" color="$muted400">
                mbps
              </Text>
            </HStack>
          </VStack>

          <HStack space="md" alignItems="center" justifyContent="space-between">
            <HStack flex={1} space="md" alignItems="center">
              <Icon as={ArrowUpCircleIcon} color="$muted500" />
              <Text color="$muted500">Upload</Text>
            </HStack>
            <Progress flex={2} size="md" rounded="md" value={percentUp}>
              <ProgressFilledTrack />
            </Progress>
          </HStack>
        </VStack>
      </VStack>
    </View>
  )
}

export default SpeedTest
