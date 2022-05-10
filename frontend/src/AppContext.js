import { createContext } from 'react'

export const AppContext = createContext({
  activeSidebarItem: 'admin/home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {}
})
