import { createContext } from 'react'

export const AppContext = createContext({
  activeSidebarItem: 'admin/home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {}
})

export const alertState = {
  alert: () => {}
}

// TODO Toast
export const AlertContext = createContext(alertState)
