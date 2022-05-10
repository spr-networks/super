import React, { createContext, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AppContext } from 'AppContext'
import AdminNavbar from 'components/Navbars/AdminNavbar'
import Footer from 'components/Footer/Footer'
import Sidebar from 'components/Sidebar/Sidebar'
import { ConnectWebsocket } from 'api'
import { ucFirst } from 'utils'

import {
  Alert,
  Box,
  Slide,
  IconButton,
  CloseIcon,
  ScrollView,
  HStack,
  Stack,
  VStack,
  Text,
  useColorModeValue,
  useToken,
  useToast
} from 'native-base'

import routes from 'routes'

const AppAlert = (props) => {
  const { type, title, body, toggle } = props

  return (
    <Alert w="100%" variant="left-accent" status={type}>
      <VStack space={2} flexShrink={1} w="100%">
        <HStack
          flexShrink={1}
          space={2}
          justifyContent="space-between"
          alignItems="center"
        >
          <HStack space={2} flexShrink={1}>
            <Alert.Icon mt="1" />
            <HStack space={2}>
              <Text fontSize="md" color="coolGray.800" bold>
                {title}
              </Text>
              <Text fontSize="md" color="coolGray.800">
                {body}
              </Text>
            </HStack>
          </HStack>
          <IconButton
            variant="unstyled"
            _focus={{
              borderWidth: 0
            }}
            icon={<CloseIcon size="3" color="coolGray.600" />}
            onPress={toggle}
          />
        </HStack>
      </VStack>
    </Alert>
  )
}

const alertState = {
  alert: () => {}
}

// TODO Toast
export const AlertContext = createContext(alertState)

const AdminLayout = (props) => {
  const mainPanel = React.useRef()

  const [websock, setwebsock] = useState(null)

  const [showAlert, setShowAlert] = useState(false)
  const [alert, setAlert] = useState({})
  const toggleAlert = () => setShowAlert(!showAlert)

  alertState.alert = (type = 'info', title, body = null) => {
    if (!body) {
      body = title
      title = ucFirst(type)
    }

    setAlert({ type, title, body })
    setShowAlert(true)
    setTimeout((_) => setShowAlert(false), 5e3)
  }

  alertState.success = (title, body) => alertState.alert('success', title, body)
  alertState.info = (title, body) => alertState.alert('info', title, body)
  alertState.warning = (title, body) => alertState.alert('warning', title, body)
  alertState.danger = (title, body) => alertState.alert('danger', title, body)
  alertState.error = (title, body) => alertState.alert('error', title, body)

  /*
  location = useLocation()
  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.scrollingElement.scrollTop = 0
    mainPanel.current.scrollTop = 0
  }, [location])*/

  const toast = useToast()

  useEffect(() => {
    ConnectWebsocket((event) => {
      if (event.data == 'success') {
        return
      } else if (event.data == 'Authentication failure') {
        return alertState.error('Websocket failed to authenticate')
      }

      let data = JSON.parse(event.data)
      let innerData = {}
      if (data.Data) {
        innerData = JSON.parse(data.Data)
      }

      // Notify WiFi Authentication state
      if (data.Type == 'PSKAuthSuccess') {
        alertState.success('Authentication success for MAC ' + innerData.MAC)
      } else if (data.Type == 'PSKAuthFailure') {
        let reasonString = ''
        let wpaType = { sae: 'WPA3', wpa: 'WPA2' }[innerData.Type]

        if (innerData.Reason == 'noentry') {
          reasonString = 'Unknown device with ' + wpaType
        } else if (innerData.Reason == 'mismatch') {
          reasonString = 'Wrong password with ' + wpaType
        }

        alertState.error(
          'Authentication failure for MAC ' +
            innerData.MAC +
            ': ' +
            reasonString
        )
      }
    })
  }, [])

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
        bg={useColorModeValue(
          'backgroundContentLight',
          'backgroundContentDark'
        )}
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
                _light={{ bg: 'coolGray.100' }}
                _dark={{ bg: 'blueGray.900:alpha.50' }}
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
              <Box
                flex="1"
                p="4"
                safeAreaTop
                ref={mainPanel}
                minH="calc(100vh - 64px)"
              >
                <Outlet />

                <Footer marginTop="auto" />
              </Box>
            </HStack>
          </Box>
        </ScrollView>
      </Box>
      <AlertContext.Provider value={alertState}>
        <Slide in={showAlert} placement="top">
          <Box
            maxWidth="90%"
            top="16"
            position="sticky"
            alignItems="center"
            justifyContent="center"
            alignSelf="center"
          >
            <AppAlert
              title={alert.title}
              body={alert.body}
              type={alert.type}
              toggle={toggleAlert}
            />
          </Box>
        </Slide>

        {/*toast.show({render: ({ id }) => { return (<h2>custom toast!</h2>) })*/}

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
    </AppContext.Provider>
  )
}

export default AdminLayout
