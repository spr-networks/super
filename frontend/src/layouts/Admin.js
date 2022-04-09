import React from 'react'
// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from 'perfect-scrollbar'
import { Route, Switch, useLocation } from 'react-router-dom'

import AdminNavbar from 'components/Navbars/AdminNavbar'
import Footer from 'components/Footer/Footer'
import Sidebar from 'components/Sidebar/Sidebar'
//import FixedPlugin from "components/FixedPlugin/FixedPlugin.js";
import NotificationAlert from 'react-notification-alert'
import { ConnectWebsocket } from 'api'

import routes from 'routes'

var ps

const errorState = {
  reportError: () => {},
  reportSuccess: () => {}
}

export const APIErrorContext = React.createContext(errorState)

function Admin(props) {
  const location = useLocation()
  const [backgroundColor, setBackgroundColor] = React.useState('black')
  const [activeColor, setActiveColor] = React.useState('info')
  const [sidebarMini, setSidebarMini] = React.useState(false)
  const mainPanel = React.useRef()
  const notificationAlert = React.useRef()
  const [websock, setwebsock] = React.useState(null)

  errorState.reportError = (message) => {
    var options = {}
    options = {
      place: 'tc',
      message: (
        <div>
          <div>{message}</div>
        </div>
      ),
      type: 'danger',
      icon: 'now-ui-icons ui-1_bell-53',
      autoDismiss: 7
    }

    notificationAlert.current.notificationAlert(options)
  }

  errorState.reportSuccess = (message) => {
    var options = {}
    options = {
      place: 'tc',
      message: (
        <div>
          <div>{message}</div>
        </div>
      ),
      type: 'success',
      icon: 'now-ui-icons ui-1_bell-53',
      autoDismiss: 7
    }

    notificationAlert.current.notificationAlert(options)
  }

  React.useEffect(() => {
    if (navigator.platform.indexOf('Win') > -1) {
      document.documentElement.className += ' perfect-scrollbar-on'
      document.documentElement.classList.remove('perfect-scrollbar-off')
      ps = new PerfectScrollbar(mainPanel.current)
    }
    return function cleanup() {
      if (navigator.platform.indexOf('Win') > -1) {
        ps.destroy()
        document.documentElement.className += ' perfect-scrollbar-off'
        document.documentElement.classList.remove('perfect-scrollbar-on')
      }
    }
  })

  React.useEffect(() => {
    document.documentElement.scrollTop = 0
    document.scrollingElement.scrollTop = 0
    mainPanel.current.scrollTop = 0
  }, [location])

  React.useEffect(() => {
    ConnectWebsocket((event) => {
      if (event.data == 'success') {
        return
      } else if (event.data == 'Authentication failure') {
        errorState.reportError('Websocket failed to authenticate')
        return
      }

      let data = JSON.parse(event.data)
      let innerData = {}
      if (data.Data) {
        innerData = JSON.parse(data.Data)
      }
      // Notify WiFi Authentication state
      if (data['Type'] == 'PSKAuthSuccess') {
        errorState.reportSuccess(
          'Authentication success for MAC ' + innerData['MAC']
        )
      } else if (data['Type'] == 'PSKAuthFailure') {
        let reasonString = ''
        let wpa_type = { sae: 'WPA3', wpa2: 'WPA2' }[innerData['Type']]
        if (innerData.Reason == 'noentry') {
          reasonString = 'Unknown device with' + wpa_type
        } else if (innerData.Reason == 'mismatch') {
          reasonString = 'Wrong password with ' + wpa_type
        }
        errorState.reportError(
          'Authentication failure for MAC ' +
            innerData['MAC'] +
            ': ' +
            reasonString
        )
      }
    })
  }, [])

  const getRoutes = (routes) => {
    return routes.map((prop, key) => {
      if (prop.collapse) {
        return getRoutes(prop.views)
      }
      if (prop.layout === '/admin') {
        return (
          <Route
            path={prop.layout + prop.path}
            component={prop.component}
            key={key}
          />
        )
      } else {
        return null
      }
    })
  }
  const handleActiveClick = (color) => {
    setActiveColor(color)
  }
  const handleBgClick = (color) => {
    setBackgroundColor(color)
  }
  const handleMiniClick = () => {
    if (document.body.classList.contains('sidebar-mini')) {
      setSidebarMini(false)
    } else {
      setSidebarMini(true)
    }
    document.body.classList.toggle('sidebar-mini')
  }

  return (
    <div className="wrapper">
      <Sidebar
        {...props}
        routes={routes}
        bgColor={backgroundColor}
        activeColor={activeColor}
      />
      <div className="main-panel" ref={mainPanel}>
        <AdminNavbar {...props} handleMiniClick={handleMiniClick} />
        <APIErrorContext.Provider value={errorState}>
          <NotificationAlert ref={notificationAlert} />
        </APIErrorContext.Provider>
        <Switch>{getRoutes(routes)}</Switch>
        {
          // we don't want the Footer to be rendered on full screen maps page
          props.location.pathname.indexOf('full-screen-map') !== -1 ? null : (
            <Footer fluid />
          )
        }
      </div>
    </div>
  )
}

export default Admin
