import React, { createContext, useEffect, useState } from 'react'
import { Route, Switch, useLocation } from 'react-router-dom'
import NotificationAlert from 'react-notification-alert'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import AdminNavbar from 'components/Navbars/AdminNavbar'
import Footer from 'components/Footer/Footer'
import Sidebar from 'components/Sidebar/Sidebar'
//import FixedPlugin from "components/FixedPlugin/FixedPlugin.js";
import { ConnectWebsocket } from 'api'
import { ucFirst } from 'utils'
import {
  Alert,
  View,
  Collapse,
  Divider,
  Box,
  Center,
  Slide,
  Heading,
  Icon,
  IconButton,
  CheckIcon,
  CloseIcon,
  ScrollView,
  HStack,
  Stack,
  VStack,
  Text,
  useColorModeValue,
  useToast
} from 'native-base'

import routes from 'routes'
import {
  faCheckCircle,
  faCircleExclamation,
  faCircleXmark,
  faHeartPulse,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

const errorState = {
  reportError: () => {},
  reportSuccess: () => {}
}

const CustomAlert = (props) => {
  const { alertType, alertTitle, alertBody, toggleAlert } = props

  return (
    <Alert w="100%" variant="left-accent" status={alertType}>
      <VStack space={2} flexShrink={1} w="100%">
        <HStack flexShrink={1} space={2} justifyContent="space-between">
          <HStack space={2} flexShrink={1}>
            <Alert.Icon mt="1" />
            <Text fontSize="md" color="coolGray.800">
              {alertTitle} {alertBody}
            </Text>
          </HStack>
          <IconButton
            variant="unstyled"
            _focus={{
              borderWidth: 0
            }}
            icon={<CloseIcon size="3" color="coolGray.600" />}
            onPress={toggleAlert}
          />
        </HStack>
      </VStack>
    </Alert>
  )
}

const alertState = {
  alert: () => {}
}

export const AppContext = createContext({
  activeSidebarItem: 'admin/home',
  setActiveSidebarItem: (sidebarItem) => {},
  isNavbarOpen: false,
  setIsNavbarOpen: (isNavbarOpen) => {}
})

export const APIErrorContext = React.createContext(errorState)
export const AlertContext = React.createContext(alertState)

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

  const [showAlert, setShowAlert] = React.useState(false)
  const [alertType, setAlertType] = React.useState('info')
  const [alertTitle, setAlertTitle] = React.useState('')
  const [alertBody, setAlertBody] = React.useState('')
  const toggleAlert = () => setShowAlert(!showAlert)

  alertState.alert = (type = 'info', title, body = null) => {
    setAlertType(type)

    if (!body) {
      body = title
      title = ucFirst(type)
    }

    setAlertTitle(title)
    setAlertBody(body)
    setShowAlert(true)
    setTimeout((_) => setShowAlert(false), 5e3)
  }

  alertState.success = (title, body) => alertState.alert('success', title, body)
  alertState.info = (title, body) => alertState.alert('info', title, body)
  alertState.warning = (title, body) => alertState.alert('warning', title, body)
  alertState.danger = (title, body) => alertState.alert('danger', title, body)
  alertState.error = (title, body) => alertState.alert('error', title, body)

  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.scrollingElement.scrollTop = 0
    mainPanel.current.scrollTop = 0
  }, [location])

  const toast = useToast()

  useEffect(() => {
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

  const [activeSidebarItem, setActiveSidebarItem] = useState('')
  const [isOpenSidebar, setIsOpenSidebar] = useState(false)
  const [isNavbarOpen, setIsNavbarOpen] = useState(false)

  return (
    <AppContext.Provider
      value={{
        activeSidebarItem,
        setActiveSidebarItem,
        setIsNavbarOpen,
        isNavbarOpen
      }}
    >
      <Box
        w="100%"
        h={{ base: '100%', md: '100vh' }} // md: '100vh'
        _light={{ bg: 'coolGray.100' }}
        _dark={{ bg: 'blueGray.900' }}
        alignItems="center"
        nativeID={useColorModeValue('coolGray.100', 'blueGray.900')}
      >
        <ScrollView w="100%" nativeID="scrollview-id">
          <Box h="100%" w="100%">
            <Box
              display={{ base: 'none', md: 'flex' }}
              w="100%"
              position="sticky"
              top="0"
              zIndex={99}
              _light={{ bg: 'coolGray.100' }}
              _dark={{ bg: 'blueGray.900:alpha.50' }}
              // @ts-ignore
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <AdminNavbar
                isMobile={false}
                isOpenSidebar={isOpenSidebar}
                setIsOpenSidebar={setIsOpenSidebar}
              />
            </Box>
            <Box
              display={{ base: 'flex', md: 'none' }}
              w="100%"
              position="sticky"
              top="0"
              zIndex={99}
              _light={{ bg: 'coolGray.100' }}
              _dark={{ bg: 'blueGray.900:alpha.50' }}
              // @ts-ignore
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <AdminNavbar
                isMobile={true}
                isOpenSidebar={isOpenSidebar}
                setIsOpenSidebar={setIsOpenSidebar}
              />
            </Box>

            <HStack>
              <Box
                position="sticky"
                top="16"
                h="calc(100vh - 64px)"
                display={{ base: 'none', md: 'flex' }}
              >
                <Sidebar
                  isMobile={false}
                  isMini={isOpenSidebar}
                  isOpenSidebar={true}
                  setIsOpenSidebar={setIsOpenSidebar}
                  routes={routes}
                />
              </Box>
              {isOpenSidebar ? (
                <Box
                  position="fixed"
                  top="16"
                  h="calc(100vh - 64px)"
                  w="100%"
                  zIndex={99}
                  display={{ base: 'flex', md: 'none' }}
                >
                  <Sidebar
                    isMobile={true}
                    isMini={false}
                    isOpenSidebar={isOpenSidebar}
                    setIsOpenSidebar={setIsOpenSidebar}
                    routes={routes}
                  />
                </Box>
              ) : null}

              {/*<ScrollContext.Provider value={{ timestamp, setTimestamp }}>*/}
              {/*h="calc(100% - 64px)"
               minH="calc(100vh - 64px)"*/}
              <Box flex="1" p="4" safeAreaTop ref={mainPanel}>
                {/*<SubMainContent props={props} />*/}

                <APIErrorContext.Provider value={errorState}>
                  <NotificationAlert ref={notificationAlert} />
                </APIErrorContext.Provider>

                <AlertContext.Provider value={alertState}>
                  <Slide in={showAlert} placement="top">
                    <Box
                      maxWidth="360"
                      top="16"
                      position="sticky"
                      alignItems="center"
                      justifyContent="center"
                      alignSelf="center"
                    >
                      {/*toast.show({render: ({ id }) => { return (<h2>custom toast!</h2>) })*/}
                      <CustomAlert
                        alertTitle={alertTitle}
                        alertBody={alertBody}
                        alertType={alertType}
                        toggleAlert={toggleAlert}
                      />
                    </Box>
                  </Slide>

                  {/*
                  <Slide in={showAlert} placement="top">
                    <Box
                      w="100%"
                      position="absolute"
                      p="4"
                      borderRadius="xs"
                      bg={alertType + '.200'}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <HStack space={2}>
                        <Icon
                          as={FontAwesomeIcon}
                          icon={
                            alertType == 'error'
                              ? faCircleXmark
                              : alertType == 'success'
                              ? faCheckCircle
                              : faCircleExclamation
                          }
                          size="sm"
                          color={alertType + '.600'}
                          _dark={{
                            color: alertType + '.700'
                          }}
                        />
                        <Text
                          color={alertType + '.600'}
                          textAlign="center"
                          _dark={{
                            color: alertType + '.700'
                          }}
                          fontWeight="medium"
                        >
                          <Text bold>{alertTitle}</Text> {alertBody}
                        </Text>
                      </HStack>
                    </Box>
                  </Slide>
                  */}
                </AlertContext.Provider>

                <Box flex="1">
                  <Switch>{getRoutes(routes)}</Switch>
                </Box>
                {props.location.pathname.indexOf('full-screen-map') !==
                -1 ? null : (
                  <Footer fluid />
                )}
              </Box>
            </HStack>
          </Box>
        </ScrollView>
      </Box>
    </AppContext.Provider>
  )
}

export default Admin
