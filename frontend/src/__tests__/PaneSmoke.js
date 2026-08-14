import 'react-native'
import React from 'react'
import { act, render } from 'test-utils'
import { MemoryRouter, Routes, Route } from 'react-router-native'

import {
  AppContext,
  AlertContext,
  ModalContext,
  alertState,
  modalState
} from 'AppContext'
import { saveLogin, setApiURL } from 'api'
import { routes } from 'routes'
import TabViewComponent from 'components/TabView'

const PARAM_VALUES = {
  id: '11:22:33:44:55:66',
  ip: '192.168.2.101',
  ips: '192.168.2.101',
  text: '',
  name: 'dns-block-extension'
}

const flattenRoutes = (list, parents = []) =>
  list.flatMap((route) =>
    route.views
      ? flattenRoutes(route.views, [...parents, route.name])
      : route.component
        ? [{ ...route, group: parents.join('/') }]
        : []
  )

const concretePath = (path) =>
  path
    .split('/')
    .map((seg) =>
      seg.startsWith(':') ? PARAM_VALUES[seg.slice(1)] ?? 'test' : seg
    )
    .join('/')

const panes = flattenRoutes(routes)

const appContextValue = {
  activeSidebarItem: 'home',
  setActiveSidebarItem: () => {},
  isNavbarOpen: false,
  setIsNavbarOpen: () => {},
  isSimpleMode: false,
  setIsSimpleMode: () => {},
  isWifiDisabled: false,
  isPlusDisabled: false,
  isMeshNode: false,
  isFeaturesInitialized: true,
  features: ['wifi', 'dns', 'dns-block', 'firewall', 'wireguard', 'ppp'],
  isFeatureFlagsInitialized: true,
  featureFlags: [],
  setFeatureFlags: () => {},
  routes,
  devices: [],
  getDevices: () => Promise.resolve([]),
  getDevice: () => null,
  getGroups: () => [],
  viewSettings: {},
  setViewSettings: () => {},
  theme: 'blackpink',
  setTheme: () => {},
  customThemes: [],
  saveCustomTheme: () => {},
  deleteCustomTheme: () => {}
}

const installAlertState = () => {
  alertState.alert = () => {}
  alertState.success = () => {}
  alertState.warning = () => {}
  alertState.danger = () => {}
  alertState.error = () => {}
  alertState.info = () => {}
  alertState.confirm = () => {}
  modalState.modal = () => {}
  modalState.setShowModal = () => {}
  modalState.toggleModal = () => {}
}

class CrashCatcher extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.props.onCrash(error, info)
  }

  render() {
    return this.state.error ? null : this.props.children
  }
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

const covered = []

const mountUnder = async (pane, element, label) => {
  const crashes = []
  covered.push(label)

  const utils = render(
    <CrashCatcher
      onCrash={(error, info) =>
        crashes.push({ label, error, componentStack: info?.componentStack })
      }
    >
      <AppContext.Provider value={appContextValue}>
        <AlertContext.Provider value={alertState}>
          <ModalContext.Provider value={modalState}>
            <MemoryRouter initialEntries={['/admin/' + concretePath(pane.path)]}>
              <Routes>
                <Route path={'/admin/' + pane.path} element={element} />
              </Routes>
            </MemoryRouter>
          </ModalContext.Provider>
        </AlertContext.Provider>
      </AppContext.Provider>
    </CrashCatcher>
  )

  await settle()

  return { utils, crashes }
}

const tabsOf = (utils) =>
  utils
    .UNSAFE_queryAllByType(TabViewComponent)
    .flatMap((node) => {
      const { tabs } = node.props
      return Array.isArray(tabs) ? tabs : []
    })
    .map((tab) => {
      let component = null
      try {
        component = tab.component || tab.renderItem?.()
      } catch (e) {
        component = null
      }
      return { title: tab.label || tab.title, component }
    })
    .filter((tab) => tab.component)

const asElement = (component) =>
  React.isValidElement(component) ? component : React.createElement(component)

const { SPR_API, SPR_USER = 'admin', SPR_PASS = 'admin' } = process.env

beforeAll(async () => {
  installAlertState()

  if (SPR_API) {
    delete process.env.REACT_APP_API
    setApiURL(SPR_API)
    await saveLogin(SPR_USER, SPR_PASS)
  } else {
    await saveLogin('admin', 'admin')
  }
})

afterAll(() => {
  console.log(
    `\nmounted ${covered.length} panes against ${SPR_API || 'mock API'}:\n` +
      covered.map((label) => `  - ${label}`).join('\n')
  )
})

describe('pane smoke test', () => {
  test.each(panes.map((pane) => [pane.name || pane.path, pane]))(
    'renders %s',
    async (name, pane) => {
      const crashes = []

      const root = await mountUnder(pane, <pane.component />, name)
      crashes.push(...root.crashes)

      for (const tab of tabsOf(root.utils)) {
        const label = `${name} > ${tab.title}`
        const mounted = await mountUnder(pane, asElement(tab.component), label)
        crashes.push(...mounted.crashes)

        for (const nested of tabsOf(mounted.utils)) {
          const nestedLabel = `${label} > ${nested.title}`
          const nestedMount = await mountUnder(
            pane,
            asElement(nested.component),
            nestedLabel
          )
          crashes.push(...nestedMount.crashes)
        }
      }

      if (crashes.length) {
        throw new Error(
          crashes
            .map(
              ({ label, error, componentStack }) =>
                `pane "${label}" (${pane.path}) crashed on mount:\n` +
                `${error?.stack || error}\n${componentStack || ''}`
            )
            .join('\n\n')
        )
      }
    }
  )
})
