import React, { createContext, useEffect, useState } from 'react'
import { Platform, Dimensions } from 'react-native'
import { Outlet, useLocation } from 'react-router-dom'
import Notifications from 'Notifications'
import { AppContext, AlertContext, alertState } from 'AppContext'
import AdminNavbar from 'components/Navbars/AdminNavbar'
import Sidebar from 'components/Sidebar/Sidebar'
import { connectWebsocket, parseLogMessage } from 'api/WebSocket'
import { api, pfwAPI, wifiAPI } from 'api'
import { ucFirst } from 'utils'

import {
  Alert,
  AlertDialog,
  Box,
  Button,
  Slide,
  IconButton,
  CloseIcon,
  ScrollView,
  HStack,
  VStack,
  Text,
  useColorModeValue,
  useToast
} from 'native-base'

import { routes } from 'routes'

const ConfirmTrafficAlert = (props) => {
  const { type, title, body, showAlert, onClose } = props

  const onPressDeny = () => onClose('deny')
  const onPressAllow = () => onClose('allow')
  const onPressClose = () => onClose('cancel')

  const cancelRef = React.useRef(null)

  return (
    <AlertDialog
      leastDestructiveRef={cancelRef}
      isOpen={showAlert}
      onClose={onPressClose}
    >
      <AlertDialog.Content>
        <AlertDialog.CloseButton />
        <AlertDialog.Header>{title}</AlertDialog.Header>
        <AlertDialog.Body>{body}</AlertDialog.Body>
        <AlertDialog.Footer>
          <Button.Group space={2}>
            <Button
              variant="unstyled"
              colorScheme="coolGray"
              onPress={onPressClose}
              ref={cancelRef}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              colorScheme="danger"
              onPress={onPressDeny}
            >
              Deny
            </Button>
            <Button
              variant="outline"
              colorScheme="success"
              onPress={onPressAllow}
            >
              Allow
            </Button>
          </Button.Group>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  )
}

const AppAlert = (props) => {
  const { type, title, body, showAlert, toggle } = props

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
          alignItems="flex-start"
        >
          <HStack space={2} flexShrink={1}>
            <Alert.Icon mt={1} />
            <VStack space={2} w="100%">
              <Text
                fontSize="md"
                color={useColorModeValue('coolGray.800', 'coolGray.200')}
                bold
              >
                {title}
              </Text>
              <Text
                fontSize="md"
                color={useColorModeValue('coolGray.800', 'coolGray.200')}
              >
                {body}
              </Text>
            </VStack>
          </HStack>
          <IconButton
            variant="unstyled"
            _focus={{
              borderWidth: 0
            }}
            icon={
              <CloseIcon
                size={3}
                color={useColorModeValue('coolGray.600', 'coolGray.400')}
              />
            }
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
  const [showConfirmAlert, setShowConfirmAlert] = useState(false)
  const [alert, setAlert] = useState({})
  const [confirmAlert, setConfirmAlert] = useState({})
  const toggleAlert = () => setShowAlert(!showAlert)

  alertState.alert = (type = 'info', title, body = null) => {
    if (typeof title !== 'string') {
      title = JSON.stringify(title)
    }

    if (!body) {
      body = title
      title = ucFirst(type)
    }

    const showAlert = (type, title, body) => {
      // web desktop notification
      if (['error', 'success'].includes(type) && Platform.OS == 'web') {
        Notifications.notification(title, body)
      }

      setAlert({ type, title, body })
      setShowAlert(true)

      // auto hide if not a confirm dialog
      setTimeout((_) => setShowAlert(false), 5e3)
    }

    // error response from api - get error msg instead of status
    if (typeof body == 'object' && body.response !== undefined) {
      body.response
        .text()
        .then((data) => {
          showAlert(type, title, data)
        })
        .catch((err) => {
          showAlert(type, title, JSON.stringify(body))
        })
    } else {
      showAlert(type, title, body)
    }
  }

  alertState.success = (title, body) => alertState.alert('success', title, body)
  alertState.warning = (title, body) => alertState.alert('warning', title, body)
  alertState.danger = (title, body) => alertState.alert('danger', title, body)
  alertState.error = (title, body) => alertState.alert('error', title, body)
  alertState.info = (title, body) => alertState.alert('info', title, body)
  alertState.confirm = (title, body, onClose) => {
    // TODO cant change if a confirm is showing an we get another one
    if (showConfirmAlert) {
      console.log('TODO confirm on confirm, need a queue here')
      return
    }

    setConfirmAlert({ type: 'confirm', title, body, onClose })
    setShowConfirmAlert(true)
  }

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
  const [version, setVersion] = useState('v0.1')

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

    api
      .version()
      .then(setVersion)
      .catch((err) => {})

    // callback for notifications, web & ios
    // action = allow,deny,cancel, data = nft data
    const confirmTrafficAction = (action, data) => {
      //action == allow, deny, cancel
      console.log('## confirm action:', action, 'data:', data)

      //depending on action here:
      //if packet allowed & should deny in future
      //if packet denied & should allow in future
      if (data.Action == 'allowed' && action == 'deny') {
        if (!data.TCP && !data.UDP) {
          return
        }

        let Protocol = data.TCP !== undefined ? 'tcp' : 'udp'

        let block = {
          RuleName: `Block ${data.Timestamp}`,
          Condition: '',
          Protocol,
          Client: { SrcIP: data.IP.SrcIP },
          DstIP: data.IP.DstIP,
          DstPort: data[Protocol.toUpperCase()].DstPort.toString(),
          Time: { Days: [], Start: '', End: '' }
        }

        pfwAPI.addBlock(block).then((res) => {
          //console.log('++ block added')
        })
      } else if (data.action == 'blocked' && action == 'allow') {
        // TODO remove block if data['oob.prefix'].startsWith('drop:pfw')
      }
    }

    const handleWebSocketEvent = (event) => {
      console.log('[webSocket]', event.data)
      if (event.data == 'success') {
        return
      } else if (event.data == 'Authentication failure') {
        return alertState.error('Websocket failed to authenticate')
      }

      const res = parseLogMessage(JSON.parse(event.data))
      if (res) {
        //console.log('[NOTIFICATION]', JSON.stringify(res))
        let { type, title, body, data } = res

        if (title == 'StatusCalled') {
          //ignore debug message
          return
        }

        //console.log('plus disabled:', isPlusDisabled)

        // confirm notifications use pfw
        if (isPlusDisabled && type == 'confirm') {
          type = 'info'
        }

        if (Platform.OS == 'ios') {
          // for now we have default = only msg & confirm = userAction
          //Notifications.notification(title, body, category)
          if (type == 'confirm') {
            Notifications.confirm(title, body, data)
          } else {
            Notifications.notification(title, body)
          }
        } else {
          if (type == 'confirm') {
            alertState.confirm(title, body, (action) => {
              setShowConfirmAlert(false)

              confirmTrafficAction(action, data)
            })
          } else {
            alertState[type](title, body)
          }
        }
      }
    }

    connectWebsocket(handleWebSocketEvent)

    let notificationArgs = {}
    if (Platform.OS == 'ios') {
      //for ios we get an event - no callback
      //this function is called when user clicks a local notification
      notificationArgs.onLocalNotification = (notification) => {
        const userInfo = notification.getData() //=userInfo
        const isClicked = userInfo.userInteraction === 1
        const action = notification.getActionIdentifier() // open, allow, deny
        const { data } = userInfo
        confirmTrafficAction(action, data)
      }
    }

    Notifications.init(notificationArgs)
  }, [])

  // this will trigger after the features check
  useEffect(() => {
    if (isWifiDisabled) {
      return
    }

    wifiAPI
      .defaultInterface()
      .then((iface) => {
        wifiAPI
          .status(iface)
          .then((res) => {})
          .catch((err) => {
            alertState.error(
              'hostapd failed to start - check wifid service logs'
            )
          })
      })
      .catch((err) => {
        alertState.error(
          'could not find a default wireless interface - check wifid service logs'
        )
      })
  }, [isWifiDisabled])

  let navbarHeight = 64
  let heightContent = Dimensions.get('window').height - navbarHeight
  if (Platform.OS == 'ios') {
    // statusbar
    heightContent = Dimensions.get('window').height - navbarHeight //- 16
  }

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
            version={version}
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
            version={version}
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
              h={{ base: heightContent, md: heightContent }}
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
            flex={1}
            px={{ base: 0, md: 0 }}
            py={{ base: 0, md: 0 }}
            ref={mainPanel}
            __h={heightContent}
          >
            <Outlet />
            {/*NOTE footer should not be visible - outside of the view and show when scroll to bottom to use the most space*/}
            {/*<Footer />*/}
          </Box>
        </HStack>
      </Box>
      <AlertContext.Provider value={alertState}>
        <Slide in={showAlert} placement="top">
          <Box
            maxWidth={{ base: '100%', md: '90%' }}
            w={{ base: '100%', md: 'auto' }}
            mt={16}
            flexWrap="wrap"
            position="static"
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
        <ConfirmTrafficAlert
          title={confirmAlert.title}
          body={confirmAlert.body}
          type={confirmAlert.type}
          showAlert={showConfirmAlert}
          onClose={confirmAlert.onClose}
        />

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
