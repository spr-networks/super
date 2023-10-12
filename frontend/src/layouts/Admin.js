import React, { useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { Outlet, useLocation } from 'react-router-dom'

import Notifications from 'Notifications'
import { AppContext, AlertContext, alertState } from 'AppContext'
import AdminNavbar from 'components/Navbars/AdminNavbar'
import Sidebar from 'components/Sidebar/Sidebar'
import { connectWebsocket, parseLogMessage } from 'api/WebSocket'
import { api, notificationsAPI, meshAPI, pfwAPI, wifiAPI } from 'api'
import { ucFirst } from 'utils'

import {
  Alert,
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogCloseButton,
  AlertDialogBody,
  AlertDialogFooter,
  AlertIcon,
  AlertText,
  Box,
  Button,
  ButtonGroup,
  ButtonText,
  Heading,
  HStack,
  Icon,
  InfoIcon,
  CheckCircleIcon,
  CloseIcon,
  Pressable,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

//NOTE Slice transition not available in gluestack-ui
import { Slide } from 'native-base'

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
      <AlertDialogBackdrop />
      <AlertDialogContent>
        <AlertDialogCloseButton>
          <Icon as={CloseIcon} />
        </AlertDialogCloseButton>
        <AlertDialogHeader>
          <Heading size="lg">{title}</Heading>
        </AlertDialogHeader>
        <AlertDialogBody>{body}</AlertDialogBody>
        <AlertDialogFooter>
          <ButtonGroup space={2}>
            <Button
              variant="unstyled"
              colorScheme="coolGray"
              onPress={onPressClose}
              ref={cancelRef}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              variant="outline"
              colorScheme="danger"
              onPress={onPressDeny}
            >
              <ButtonText>Deny</ButtonText>
            </Button>
            <Button
              variant="outline"
              colorScheme="success"
              onPress={onPressAllow}
            >
              <ButtonText>Allow</ButtonText>
            </Button>
          </ButtonGroup>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const AppAlert = (props) => {
  const { type, title, body, showAlert, toggle } = props

  //CheckCircleIcon
  //InfoIcon
  let alertIcon = CheckCircleIcon

  return (
    <Alert action={type}>
      <AlertIcon as={alertIcon} size="xl" mr="$3" />
      <HStack space="md">
        <VStack space="xs">
          <AlertText fontWeight="$bold">{title}</AlertText>

          <AlertText>{body}</AlertText>
        </VStack>
        <Pressable onPress={toggle}>
          <Icon as={CloseIcon} />
        </Pressable>
      </HStack>
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

  //const toast = useToast()

  let path = location.pathname.replace(/^\/admin\//, '')
  const [activeSidebarItem, setActiveSidebarItem] = useState(path)
  const [isOpenSidebar, setIsOpenSidebar] = useState(false)
  const [isNavbarOpen, setIsNavbarOpen] = useState(false)
  const [isWifiDisabled, setIsWifiDisabled] = useState(null)
  const [isPlusDisabled, setIsPlusDisabled] = useState(true)
  const [isMeshNode, setIsMeshNode] = useState(false)
  const [version, setVersion] = useState('v0.1')

  const [notificationSettings, setNotificationSettings] = useState([])

  useEffect(() => {
    api
      .features()
      .then((res) => {
        setIsWifiDisabled(!res.includes('wifi'))

        meshAPI
          .leafMode()
          .then((res) => setIsMeshNode(JSON.parse(res) === true))
          .catch((err) => {})
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
        //if no pfw check if mesh is around
        meshAPI
          .leafMode()
          .then((res) => {
            setIsPlusDisabled(false)
          })
          .catch((err) => {
            setIsPlusDisabled(true)
          })
      })

    api
      .version()
      .then(setVersion)
      .catch((err) => {})

    // get stetings for notificaations
    notificationsAPI.list().then((settings) => {
      setNotificationSettings(settings)
    })

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

    const handleWebSocketEvent = async (event) => {
      if (event.data == 'success') {
        return
      } else if (event.data == 'Authentication failure') {
        return alertState.error('Websocket failed to authenticate')
      }

      let eventData = JSON.parse(event.data)

      // if false it means event is streamed for logs or cli
      // this is set temporarily when viewing the sprbus via ws
      if (!eventData.Notification) {
        return
      }

      const res = await parseLogMessage(eventData)
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
    if (isWifiDisabled || isWifiDisabled === null) {
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
  let heightFull = Dimensions.get('window').height
  let heightContent = heightFull - navbarHeight

  const colorMode = useColorMode()

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
        setIsPlusDisabled,
        isMeshNode,
        setIsMeshNode
      }}
    >
      <VStack
        safeAreaTop
        bg={colorMode == 'light' ? '$coolGray100' : '$gray900'}
        minH={heightFull}
      >
        {/*desktop*/}
        <Box
          sx={{
            '@base': { display: 'none', position: 'absolute' },
            '@md': { display: 'flex', position: 'static' }
          }}
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
          sx={{
            '@base': {
              display: 'flex',
              position: Platform.OS == 'web' ? 'sticky' : 'static'
            },
            '@md': { display: 'none' }
          }}
          top={0}
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

        <HStack
          position={Platform.OS == 'web' ? 'sticky' : 'static'}
          top={Platform.OS == 'web' ? 16 : 0}
          flex={1}
          maxH={heightContent}
        >
          {/*desktop*/}
          <Box
            sx={{
              '@base': {
                display: 'none'
              },
              '@md': { display: 'flex' }
            }}
            width={isOpenSidebar ? 20 : 260}
            height={heightContent}
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
              w="100%"
              zIndex={99}
              sx={{
                '@base': {
                  display: 'flex'
                },
                '@md': { display: 'none' },
                _light: {
                  bg: 'sidebarBackgroundLight'
                },
                _dark: { bg: 'sidebarBackgroundDark' }
              }}
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
          <Box flex={1} ref={mainPanel}>
            <Outlet />
            {/*NOTE footer should not be visible - outside of the view and show when scroll to bottom to use the most space*/}
            {/*<Footer />*/}
          </Box>
        </HStack>
      </VStack>
      <AlertContext.Provider value={alertState}>
        <Slide in={showAlert} placement="top">
          <Box
            sx={{
              '@base': {
                maxWidth: '100%',
                w: '100%'
              },
              '@md': {
                minWidth: '$1/4',
                maxWidth: '90%',
                w: 'auto'
              }
            }}
            mt="$16"
            flexWrap="wrap"
            position="fixed"
            top="20"
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
