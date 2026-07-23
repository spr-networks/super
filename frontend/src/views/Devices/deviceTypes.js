export const CONTAINER_DEVICE_TYPE = 'Container'

export const isContainerDevice = (device) =>
  device?.Type?.toLowerCase() === CONTAINER_DEVICE_TYPE.toLowerCase()

export const filterDevicesForPane = (devices, showContainers) =>
  devices.filter((device) =>
    showContainers ? isContainerDevice(device) : !isContainerDevice(device)
  )
