import React, { createContext, useEffect, useState } from 'react'
import { Platform, Dimensions } from 'react-native'
import { Outlet, useLocation } from 'react-router-dom'
import Notifications from 'Notifications'
/*
import {
  Outlet as OutletWeb,
  useLocation as useLocationWeb
} from 'react-router-dom'
import {
  Outlet as OutletNative,
  useLocation as useLocationNative
} from 'react-router-native'

const Outlet = Platform.OS == 'web' ? OutletWeb : OutletNative
const useLocation = Platform.OS == 'web' ? useLocationWeb : useLocationNative
*/
import { AppContext, AlertContext, alertState } from 'AppContext'
import AdminNavbar from 'components/Navbars/AdminNavbar'
import Footer from 'components/Footer/Footer'
import Sidebar from 'components/Sidebar/Sidebar'
import { connectWebsocket, parseLogMessage } from 'api/WebSocket'
import { api, pfwAPI } from 'api'
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

import { routes } from 'routes'

const AppAlert = (props) => {
  const { type, title, body, toggle } = props

  return (
    <Alert
      w="100%"
      variant="outline-light"
      status={type}
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
    >
      <VStack space={2} flexShrink={1} w="100%">
        <HStack
          flexShrink={1}
          space={2}
          justifyContent="space-between"
          alignItems="center"
        >
          <HStack space={2} flexShrink={1}>
            <Alert.Icon mt={1} />
            <VStack space={2}>
              <Text fontSize="md" color="coolGray.800" bold>
                {title}
              </Text>
              <Text fontSize="md" color="coolGray.800">
                {body}
              </Text>
            </VStack>
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

const AdminLayout = (props) => {
  const mainPanel = React.useRef()
  const location = useLocation()

  const [showAlert, setShowAlert] = useState(false)
  const [alert, setAlert] = useState({})
  const toggleAlert = () => setShowAlert(!showAlert)

  alertState.alert = (type = 'info', title, body = null) => {
    if (typeof title !== 'string') {
      title = JSON.stringify(title)
    }

    if (!body) {
      body = title
      title = ucFirst(type)
    }

    if (['error', 'success'].includes(type) && Platform.OS == 'web') {
      Notifications.notification(title, body)
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

  let path = location.pathname.replace(/^\/admin\//, '')
  const [activeSidebarItem, setActiveSidebarItem] = useState(path)
  const [isOpenSidebar, setIsOpenSidebar] = useState(false)
  const [isNavbarOpen, setIsNavbarOpen] = useState(false)
  const [isWifiDisabled, setIsWifiDisabled] = useState(false)
  const [isPlusDisabled, setIsPlusDisabled] = useState(true)

  useEffect(() => {
    api
      .features()
      .then((res) => {
        if (res.includes('wifi')) {
          setIsWifiDisabled(false)
        } else {
          setIsWifiDisabled(true)
        }
      })
      .catch((err) => {
        setIsWifiDisabled(true)
      })

    // TODO use features
    pfwAPI
      .config()
      .then((res) => {
        setIsPlusDisabled(false)
      })
      .catch((err) => {
        setIsPlusDisabled(true)
      })

    connectWebsocket((event) => {
      console.log('[webSocket]', event.data)
      if (event.data == 'success') {
        return
      } else if (event.data == 'Authentication failure') {
        return alertState.error('Websocket failed to authenticate')
      }

      const res = parseLogMessage(JSON.parse(event.data))
      if (res) {
        console.log('[LOG]', JSON.stringify(res))
        let { type, title, body } = res

        if (Platform.OS == 'ios') {
          let category = 'userAction'
          Notifications.notification(title, body, category)
        } else {
          alertState[type](title, body)
        }
      }
    })

    Notifications.init()
  }, [])

  let navbarHeight = 64
  let heightContent = Dimensions.get('window').height - navbarHeight

  return (
    <AppContext.Provider
      value={{
        activeSidebarItem,
        setActiveSidebarItem,
        setIsNavbarOpen,
        isNavbarOpen,
        isWifiDisabled,
        isPlusDisabled,
        setIsWifiDisabled,
        setIsPlusDisabled
      }}
    >
      <Box
        w="100%"
        h="100%" // md: '100vh'
        __alignItems="center"
        nativeID="content-id"
        safeAreaTop
        bg={useColorModeValue(
          'backgroundContentLight',
          'backgroundContentDark'
        )}
      >
        {/*desktop*/}
        <Box
          display={{ base: 'none', md: 'flex' }}
          position={{ base: 'absolute', md: 'static' }}
          w="100%"
          zIndex={99}
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <AdminNavbar
            isMobile={false}
            isOpenSidebar={isOpenSidebar}
            setIsOpenSidebar={setIsOpenSidebar}
          />
        </Box>
        {/*mobile*/}
        <Box
          display={{ base: 'flex', md: 'none' }}
          w="100%"
          position={{ base: 'relative', md: 'static' }}
          zIndex={99}
          _style={{ backdropFilter: 'blur(10px)' }}
        >
          <AdminNavbar
            isMobile={true}
            isOpenSidebar={isOpenSidebar}
            setIsOpenSidebar={setIsOpenSidebar}
          />
        </Box>

        <HStack h={heightContent}>
          {/*desktop*/}
          <Box
            display={{ base: 'none', md: 'flex' }}
            position={{ base: 'absolute', md: 'static' }}
            h={heightContent}
          >
            <Sidebar
              isMobile={false}
              isMini={isOpenSidebar}
              isOpenSidebar={true}
              setIsOpenSidebar={setIsOpenSidebar}
              routes={routes}
            />
          </Box>
          {/*mobile*/}
          {isOpenSidebar ? (
            <Box
              position="absolute"
              h={heightContent}
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
          <ScrollView
            flex={1}
            px={{ base: 4, md: 4 }}
            py={{ base: 4, md: 4 }}
            safeAreaTop
            ref={mainPanel}
            h={{ base: heightContent - navbarHeight, md: heightContent }}
          >
            <Outlet />
            <Footer mt="auto" />
          </ScrollView>
          {/*<Box flex="1" w="100%" minH="100%"></Box>*/}
        </HStack>
      </Box>
      <AlertContext.Provider value={alertState}>
        <Slide in={showAlert} placement="top">
          <Box
            maxWidth="90%"
            top={16}
            position={{ base: 'static', md: 'static' }}
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
export { AlertContext }
