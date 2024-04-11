import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'

import { ScrollView } from '@gluestack-ui/themed'

import useSwipe from 'components/useSwipe'
import AddAlert from 'components/Alerts/AddAlert'

import { AlertContext } from 'AppContext'

import { alertsAPI } from 'api'

const AddAlertView = () => {
  const context = useContext(AlertContext)
  const [config, setConfig] = useState([])
  const [item, setItem] = useState(null)

  const navigate = useNavigate()
  const params = useParams()

  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  useEffect(() => {
    fetchList()
  }, [])

  useEffect(() => {
    if (!config) return

    let { id } = params

    if (id == ':id') {
      //add new
    } else {
      let index = parseInt(id)
      setItem(config[index])
      console.log('item==', config[index])
    }
  }, [config])

  const swipeHandlers = useSwipe({
    onSwipedRight: () => {
      navigate('/admin/alerts/settings')
    }
  })

  const onSubmit = (item) => {
    let { id } = params

    const done = () => navigate('/admin/alerts/settings')
    const fail = (err) => context.error('failed to save rule', err)

    if (id == ':id') {
      alertsAPI.add(item).then(done).catch(fail)
    } else {
      alertsAPI.update(id, item).then(done).catch(fail)
    }
  }

  return (
    <ScrollView
      bg="$backgroundCardLight"
      h="$full"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      {...swipeHandlers}
    >
      <AddAlert curItem={item} onSubmit={onSubmit} />
    </ScrollView>
  )
}

export default AddAlertView
