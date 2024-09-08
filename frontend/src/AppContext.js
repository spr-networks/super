import React, { createContext } from 'react'

export const AppContext = createContext({
  activeSidebarItem: 'home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {},
  isSimpleMode: false,
  setIsSimpleMode: (isSimpleMode) => {},
  isWifiDisabled: false,
  isPlusDisabled: true,
  isMeshNode: false,
  isFeaturesInitialized: false,
  features: [],
  devices: [],
  getDevices: () => {},
  getDevice: () => {},
  getGroups: () => [],
  viewSettings: {},
  setViewSettings: () => {}
})

export const alertState = {
  alert: () => {}
}

export const modalState = {
  modal: () => {},
  setShowModal: () => {},
  toggleModal: () => {}
}

// TODO Toast
export const AlertContext = createContext(alertState)
export const ModalContext = createContext(modalState)
