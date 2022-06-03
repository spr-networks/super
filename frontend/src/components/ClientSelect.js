import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { groupAPI, deviceAPI } from 'api'
import InputSelect from './InputSelect'

const ClientSelect = (props) => {
  const [optGroups, setOptGroups] = useState([])

  let title = props.isMultiple ? 'Select Clients' : 'Select Client'

  const cleanIp = (ip) => ip.replace(/\/.*/, '') // remove subnet

  // todo cache
  useEffect(() => {
    deviceAPI
      .list()
      .then((devices) => {
        // devices => options
        let options = Object.values(devices)
          .filter((d) => d.RecentIP.length)
          .map((d) => {
            return {
              label: `${d.Name || d.RecentIP}`,
              value: cleanIp(d.RecentIP)
            }
          })

        let opts = []

        opts.push({
          title: props.isMultiple ? 'Select Clients' : 'Select Client',
          options
        })

        if (props.showGroups) {
          groupAPI
            .list()
            .then((groups) => {
              let options = groups.map((g) => g.Name)
              options = options.map((value) => {
                return { label: value, value }
              })

              opts.push({
                title: props.isMultiple ? 'Select Group' : 'Select Groups',
                options
              })

              setOptGroups(opts)
            })
            .catch((err) => {})
        } else {
          setOptGroups(opts)
        }
      })
      .catch((err) => {})
  }, [])

  return <InputSelect title={title} groups={optGroups} {...props} />
}

ClientSelect.propTypes = {
  isMultiple: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}

export default ClientSelect
