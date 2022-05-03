import React from 'react'
import { Route, Switch, useLocation } from 'react-router-dom'
import NotificationAlert from 'react-notification-alert'
import ReactBSAlert from 'react-bootstrap-sweetalert'

import AdminNavbar from 'components/Navbars/AdminNavbar'
import Footer from 'components/Footer/Footer'
import Sidebar from 'components/Sidebar/Sidebar'
//import FixedPlugin from "components/FixedPlugin/FixedPlugin.js";
import { ConnectWebsocket } from 'api'

import { Modal } from 'reactstrap'

import routes from 'routes'

const errorState = {
  reportError: () => {},
  reportSuccess: () => {}
}

const modalState = {
  modal: () => {}
}

export const APIErrorContext = React.createContext(errorState)
export const ModalContext = React.createContext(modalState)

function Admin(props) {
  const location = useLocation()
  const [backgroundColor, setBackgroundColor] = React.useState('black')
  const [activeColor, setActiveColor] = React.useState('info')
  const [sidebarMini, setSidebarMini] = React.useState(false)
  const mainPanel = React.useRef()
  const notificationAlert = React.useRef()

  const [showModal, setShowModal] = React.useState(false)
  const [modalTitle, setModalTitle] = React.useState('')
  const [modalBody, setModalBody] = React.useState('')

  const [websock, setwebsock] = React.useState(null)

  const toggleModal = () => setShowModal(!showModal)

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

  modalState.modal = (title, body) => {
    if (!body) {
      body = title
      title = 'Message'
    }
    setModalTitle(title)
    setModalBody(body)
    setShowModal(true)
  }
  // TODO -- merge
  modalState.reportError = modalState.modal
  modalState.success = modalState.modal

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
        if (innerData.Reason == 'noentry') {
          let wpa_type = { sae: 'WPA3', wpa: 'WPA2' }[innerData['Type']]
          reasonString = 'Unknown device with ' + wpa_type
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
        <ModalContext.Provider value={modalState}>
          <Modal
            fade={false}
            isOpen={showModal}
            toggle={toggleModal}
            autoFocus={false}
          >
            <div className="modal-header">
              <button
                aria-label="Close"
                className="close"
                data-dismiss="modal"
                type="button"
                onClick={toggleModal}
              >
                <i className="nc-icon nc-simple-remove" />
              </button>
              <h5 className="modal-title">{modalTitle}</h5>
            </div>
            <div className="modal-body">{modalBody}</div>
            <div className="modal-footer"></div>
          </Modal>
        </ModalContext.Provider>
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
