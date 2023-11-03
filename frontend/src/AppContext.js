import React, { createContext } from 'react'

export const AppContext = createContext({
  activeSidebarItem: 'home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {},
  isWifiDisabled: false,
  isPlusDisabled: true,
  isMeshNode: false,
  features: []
})

export const alertState = {
  alert: () => {}
}

// TODO Toast
export const AlertContext = createContext(alertState)
