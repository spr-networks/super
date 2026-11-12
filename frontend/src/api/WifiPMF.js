export const pmfLockedOn = (config) => {
  const opClass = parseInt(config?.op_class)
  return (
    (opClass >= 131 && opClass <= 137) ||
    config?.he_6ghz_reg_pwr_type !== undefined ||
    config?.he_6ghz_reg_power_type !== undefined
  )
}

export const pmfStationSummary = (stations, devices) => {
  const macs = Object.keys(stations || {})
  const legacy = macs
    .filter((mac) => !(stations[mac]?.flags || '').includes('[MFP]'))
    .map((mac) => devices?.[mac]?.Name || mac)
  return { connected: macs.length, legacy }
}

export const pmfAdvice = (config, summary) => {
  if (pmfLockedOn(config)) {
    return { suggest: false, text: 'Always required on 6 GHz.' }
  }
  if (config?.pmf_required) {
    return {
      suggest: false,
      text: 'Required. Devices without PMF support cannot join this network.'
    }
  }
  if (!summary || summary.connected === 0) {
    return {
      suggest: false,
      text: 'Optional. Older devices without PMF support can still join.'
    }
  }
  if (summary.legacy.length === 0) {
    return {
      suggest: true,
      text: `All ${summary.connected} connected devices use PMF. Requiring PMF is recommended.`
    }
  }
  const names = summary.legacy.join(', ')
  return {
    suggest: false,
    text: `${summary.legacy.length} of ${summary.connected} connected devices do not use PMF and would be disconnected if it is required: ${names}`
  }
}
