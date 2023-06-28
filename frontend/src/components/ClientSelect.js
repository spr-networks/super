import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Select } from 'components/Select'
import { groupAPI, deviceAPI, firewallAPI } from 'api'
import InputSelect from './InputSelect'

const ClientSelect = (props) => {
  const [devOpts, setDevOpts] = useState(null)
  const [groupOpts, setGroupOpts] = useState(null)
  const [tagOpts, setTagOpts] = useState(null)
  const [endpointOpts, setEndpointOpts] = useState(null)

  let title = props.isMultiple ? 'Select Clients' : 'Select Client'

  const cleanIp = (ip) => ip.replace(/\/.*/, '') // remove subnet

  const getTagOpts = (devices) => {
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
    setTagOpts({
      title: props.isMultiple ? 'Select Tag' : 'Select Tags',
      options: tagOptions
    })
  }

  const getGroupOpts = () => {
    return groupAPI.list().then((groups) => {
      let options = groups.map((g) => g.Name)
      options = options.map((value) => {
        return { label: value, value: { Group: value } }
      })

      setGroupOpts({
        title: props.isMultiple ? 'Select Group' : 'Select Groups',
        options
      })
    })
  }

  const getEndpointOpts = () => {
    return firewallAPI.config().then((config) => {
      let options = config.Endpoints.map((e) => e.RuleName)
      options = options.map((value) => {
        return { label: value, value: { Endpoint: value } }
      })

      setEndpointOpts({
        title: props.isMultiple ? 'Select Endpoint' : 'Select Endpoint',
        options
      })
    })
  }

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

        let deviceOpts = {
          title: props.isMultiple ? 'Select Clients' : 'Select Client',
          options
        }

        setDevOpts(deviceOpts)

        if (props.showGroups) getGroupOpts()
        if (props.showTags) getTagOpts(devices)
        if (props.showEndpoints) getEndpointOpts()
      })
      .catch((err) => {})
  }, [])

  const gatherOps = () => {
    let ops = [devOpts]

    if (groupOpts) {
      ops.push(groupOpts)
    }
    if (tagOpts) {
      ops.push(tagOpts)
    }
    if (endpointOpts) {
      ops.push(endpointOpts)
    }

    return ops
  }

  //if only select one client & cant specify: use select (example dns logs)
  if (props.isDisabled && !props.isMultiple) {
    return (
      <Select selectedValue={props.value} onValueChange={props.onChange}>
        {devOpts?.options?.map((o) => (
          <Select.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Select>
    )
  }

  return (
    <InputSelect
      title={title}
      groups={devOpts?.options ? gatherOps() : null}
      {...props}
    />
  )
}

ClientSelect.propTypes = {
  isMultiple: PropTypes.bool,
  value: PropTypes.oneOfType([
    PropTypes.array,
    PropTypes.string,
    PropTypes.object
  ]),
  onChange: PropTypes.func,
  onSubmitEditing: PropTypes.func
}

export default ClientSelect
