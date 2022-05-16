import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { deviceAPI } from 'api/Device'
import InputSelect from './InputSelect'

const ClientSelect = (props) => {
  const [list, setList] = useState([])

  let title = props.isMultiple ? 'Select Client' : 'Select Clients'

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

        setList(options)
      })
      .catch((err) => {})
  }, [])

  return <InputSelect title={title} options={list} {...props} />
}

ClientSelect.propTypes = {
  isMultiple: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}

export default ClientSelect
