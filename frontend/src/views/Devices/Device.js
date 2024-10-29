import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { ScrollView } from '@gluestack-ui/themed'
import EditDevice from 'components/Devices/EditDevice'
import { AppContext, AlertContext } from 'AppContext'

import useSwipe from 'components/useSwipe'
import { deviceAPI, blockAPI } from 'api'

import { ListHeader } from 'components/List'

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

      setPolicies([
        ...new Set(
          Object.values(devs)
            .map((device) => device.Policies)
            .flat()
        )
      ])

      let tags = [
        ...new Set(
          Object.values(devs)
            .map((device) => device.DeviceTags)
            .flat()
        )
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
  }, [params])

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
