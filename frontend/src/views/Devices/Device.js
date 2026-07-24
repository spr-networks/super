import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { Box, ScrollView, Text } from '@gluestack-ui/themed'
import EditDevice from 'components/Devices/EditDevice'
import { AppContext, AlertContext } from 'AppContext'

import useSwipe from 'components/useSwipe'
import { deviceAPI, blockAPI } from 'api'

import {
  deviceValues,
  findDeviceByIdentity,
  isContainerDevice,
  normalizeDeviceForUI
} from 'views/Devices/deviceTypes'

//import AddDevice from 'components/Devices/AddDevice'

const DeviceView = () => {
  const appContext = useContext(AppContext)
  const context = useContext(AlertContext)
  const navigate = useNavigate()
  const params = useParams()
  const [device, setDevice] = useState(null)
  const [groups, setGroups] = useState([])
  const [policies, setPolicies] = useState([])
  const [tags, setTags] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let { id } = params
    setDevice(null)
    setLoadError('')

    deviceAPI
      .list()
      .then((devs) => {
        const devices = deviceValues(devs)
        const foundDevice = findDeviceByIdentity(devs, id)
        const dev = foundDevice
          ? normalizeDeviceForUI(foundDevice)
          : null

        if (!dev) {
          setLoadError(`Device ${id} was not found`)
          return
        }

        setDevice(dev)

        // set device oui if avail
        if (dev.MAC && !isContainerDevice(dev)) {
          deviceAPI
            .oui(dev.MAC)
            .then((oui) => {
              setDevice((prev) => ({ ...prev, oui: oui?.Vendor }))
            })
            .catch((err) => {})
        }

        setGroups([...new Set(devices.flatMap((device) => device.Groups || []))])

        setPolicies([
          ...new Set(devices.flatMap((device) => device.Policies || []))
        ])

        let tags = [
          ...new Set(devices.flatMap((device) => device.DeviceTags || []))
        ]
        setTags(tags)

        //NOTE fetch all tags - dnsblock tags separate
        blockAPI
          .blocklists()
          .then((res) => {
            let tagsBlock = [
              ...new Set([].concat(...res.map((l) => l.Tags)).filter((t) => t))
            ]

            if (tagsBlock) {
              setTags([...tags, ...tagsBlock])
            }
          })
          .catch((err) => {})
      })
      .catch((err) => {
        setLoadError(`Failed to load device ${id}`)
      })
  }, [params.id])

  const refreshDevice = (showNotification = true) => {
    appContext.getDevices(true) // force update
    if (showNotification) {
      context.success('device updated')
    }
  }

  const swipeHandlers = useSwipe({
    onSwipedRight: () => {
      navigate('/admin/devices')
    }
  })

  return (
    <ScrollView
      space="md"
      h="$full"
      width="$full"
      sx={{
        '@md': { h: '92vh' }
      }}
      {...swipeHandlers}
    >
      {loadError ? (
        <Box p="$4">
          <Text color="$error600">{loadError}</Text>
        </Box>
      ) : null}
      {device ? (
        <EditDevice
          key={device.MAC || device.WGPubKey}
          device={device}
          policies={policies}
          groups={groups}
          tags={tags}
          notifyChange={refreshDevice}
        />
      ) : null}
    </ScrollView>
  )
}

export default DeviceView
