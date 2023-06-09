import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Select } from 'native-base'

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
                return { label: value, value: { Group: value } }
              })

              opts.push({
                title: props.isMultiple ? 'Select Group' : 'Select Groups',
                options
              })

              if (props.showTags) {
                let tagNames = Object.values(devices)
                  .map((device) => {
                    return device.DeviceTags
                  })
                  .flat()
                  .filter((tagName) => tagName !== '')

                tagNames = [...new Set(tagNames)]
                let tagOptions = tagNames.map((t) => {
                  return { label: t, value: { Tag: t } }
                })

                opts.push({
                  title: props.isMultiple ? 'Select Tag' : 'Select Tags',
                  options: tagOptions
                })
              }

              setOptGroups(opts)
            })
            .catch((err) => {})
        } else {
          setOptGroups(opts)
        }
      })
      .catch((err) => {})
  }, [])

  //if only select one client & cant specify: use select (example dns logs)
  if (props.isDisabled && !props.isMultiple) {
    return (
      <Select selectedValue={props.value} onValueChange={props.onChange}>
        {optGroups && optGroups.length == 1
          ? optGroups[0].options.map((o) => (
              <Select.Item label={o.label} value={o.value} />
            ))
          : null}
      </Select>
    )
  }

  return <InputSelect title={title} groups={optGroups} {...props} />
}

ClientSelect.propTypes = {
  isMultiple: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func,
  onSubmitEditing: PropTypes.func
}

export default ClientSelect
