import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { ScrollView } from '@gluestack-ui/themed'
import EditDevice from 'components/Devices/EditDevice'
import { AlertContext } from 'layouts/Admin'

import useSwipe from 'components/useSwipe'
import { deviceAPI } from 'api'

import { ListHeader } from 'components/List'

//import AddDevice from 'components/Devices/AddDevice'

const DeviceView = () => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()
  const params = useParams()
  const [device, setDevice] = useState(null)
  const [groups, setGroups] = useState([])
  const [tags, setTags] = useState([])

  useEffect(() => {
    let { id } = params
    deviceAPI.list().then((devs) => {
      let dev = devs[id] || null
      if (dev) {
        setDevice(dev)

        // set device oui if avail
        if (dev.MAC) {
          deviceAPI
            .oui(dev.MAC)
            .then((oui) => {
              let dev = device
              dev.oui = oui?.Vendor

              setDevice({ ...dev })
            })
            .catch((err) => {})
        }
      }

      setGroups([
        ...new Set(
          Object.values(devs)
            .map((device) => device.Groups)
            .flat()
        )
      ])
      setTags([
        ...new Set(
          Object.values(devs)
            .map((device) => device.DeviceTags)
            .flat()
        )
      ])
    })
  }, [])

  const refreshDevice = () => {
    context.success('device updated')
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
      <ListHeader title="Edit Device" />
      {device ? (
        <EditDevice
          key={device.MAC || device.WGPubKey}
          device={device}
          groups={groups}
          tags={tags}
          notifyChange={refreshDevice}
          allGroups={groups}
          allTags={tags}
        />
      ) : null}
    </ScrollView>
  )
}

export default DeviceView
