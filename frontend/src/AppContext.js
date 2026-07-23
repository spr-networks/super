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
  isFeatureFlagsInitialized: false,
  featureFlags: [],
  setFeatureFlags: () => {},
  routes: [],
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

//lets plugin views refresh the sidebar menu after plugin changes
export const pluginMenuState = {
  update: () => {}
}

// TODO Toast
export const AlertContext = createContext(alertState)
export const ModalContext = createContext(modalState)
