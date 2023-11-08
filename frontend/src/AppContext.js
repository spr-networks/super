import React, { createContext } from 'react'

export const AppContext = createContext({
  activeSidebarItem: 'home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {},
  isWifiDisabled: false,
  isPlusDisabled: true,
  isMeshNode: false,
  features: [],
  devices: [],
  getDevices: () => {},
  getDevice: () => {}
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
