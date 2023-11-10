import React, { useEffect, useState } from 'react'
import { Dimensions, Platform, SafeAreaView } from 'react-native'
import { Outlet, useLocation } from 'react-router-dom'

import Notifications from 'Notifications'
import {
  AppContext,
  AlertContext,
  alertState,
  ModalContext,
  modalState
} from 'AppContext'
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
  CheckCircleIcon,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContent,
  ModalCloseButton,
  ModalHeader,
  Pressable,
  VStack,
  CloseIcon,
  SlashIcon,
  InfoIcon,
  useColorMode
} from '@gluestack-ui/themed'

//NOTE Slice transition for Alerts not available in gluestack-ui

import { routes } from 'routes'
import { deviceAPI } from 'api'

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

  let iconType = {
    success: CheckCircleIcon,
    warning: SlashIcon,
    danger: InfoIcon,
    error: SlashIcon,
    info: InfoIcon
  }

  let alertIcon = iconType[type] || InfoIcon
  let alertType = type == 'danger' ? 'warning' : type

  return (
    <Alert action={alertType}>
      <HStack space="md" w="$full">
        <AlertIcon as={alertIcon} size="xl" mr="$3" alignSelf="center" />
        <VStack space="xs" flex={1}>
          <AlertText fontWeight="$bold">{title}</AlertText>
          <AlertText flexWrap="wrap">{body}</AlertText>
        </VStack>
        <Pressable ml="auto" mr="$2" onPress={toggle}>
          <Icon as={CloseIcon} />
        </Pressable>
      </HStack>
    </Alert>
  )
}

const AdminLayout = ({ toggleColorMode, ...props }) => {
  const mainPanel = React.useRef()
  const location = useLocation()

  const [showAlert, setShowAlert] = useState(false)
  const [showConfirmAlert, setShowConfirmAlert] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [alert, setAlert] = useState({})
  const [confirmAlert, setConfirmAlert] = useState({})
  const [modal, setModal] = useState({})

  const toggleAlert = () => setShowAlert(!showAlert)

  //setup alert context
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

  modalState.modal = (title, body, onClose) => {
    if (typeof title === 'object') {
      body = title.body
      onClose = title.onClose
      title = title.title
    }

    setModal({ title, body, onClose })
    setShowModal(true)
  }
  modalState.setShowModal = setShowModal
  modalState.toggleModal = () => setShowModal(!showModal)

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
  const [version, setVersion] = useState('0.2.1')
  const [features, setFeatures] = useState([])
  const [devices, setDevices] = useState([])

  const [notificationSettings, setNotificationSettings] = useState([])

  // device context stuff
  const getDevices = (forceFetch = false) => {
    return new Promise((resolve, reject) => {
      if (!forceFetch && devices?.length) {
        return resolve(devices)
      }

      deviceAPI
        .list()
        .then((devices) => {
          setDevices(Object.values(devices))
          resolve(Object.values(devices))
        })
        .catch(reject)
    })
  }

  const getDevice = (value, type = 'MAC') =>
    devices.find((d) => d[type] == value)

  useEffect(() => {
    api
      .features()
      .then((res) => {
        setFeatures([...res])
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

    getDevices().then((res) => {
      //console.log('++ got', res.length, 'devices')
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

  /*return (
    <Box bg="$red200" p="$20">
      <Text>TEST 2.0</Text>
    </Box>
  )*/
  const colorMode = useColorMode()
  const backgroundColor = colorMode === 'light' ? 'white' : 'black'

  return (
    <AppContext.Provider
      value={{
        activeSidebarItem,
        setActiveSidebarItem,
        isNavbarOpen,
        setIsNavbarOpen,
        isWifiDisabled,
        isPlusDisabled,
        isMeshNode,
        features,
        devices,
        getDevices,
        getDevice
      }}
    >
      <SafeAreaView
        style={{
          backgroundColor
        }}
      />

      {/*<SafeAreaView
        style={{
          width: '100%',
          backgroundColor: colorMode == 'light' ? '#f3f4f6' : 'black',
          flex: 1
        }}
      >*/}
      <VStack
        bg="$backgroundContentLight"
        sx={{
          _dark: {
            bg: '$backgroundContentDark'
          }
        }}
        flex={1}
      >
        {/*desktop*/}
        <Box
          display="none"
          sx={{
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
            toggleColorMode={toggleColorMode}
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
        >
          <AdminNavbar
            version={version}
            isMobile={true}
            isOpenSidebar={isOpenSidebar}
            setIsOpenSidebar={setIsOpenSidebar}
            toggleColorMode={toggleColorMode}
          />
        </Box>

        <HStack
          position={Platform.OS == 'web' ? 'sticky' : 'static'}
          top={Platform.OS == 'web' ? 16 : 0}
          flex={1}
        >
          {/*desktop*/}
          <Box
            display="none"
            sx={{
              '@md': {
                display: 'flex',
                height: Dimensions.get('window').height - 64
              }
            }}
            width={isOpenSidebar ? 80 : 260}
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
            <SafeAreaView
              style={{
                width: '100%',
                backgroundColor: colorMode == 'light' ? '#f9fafb' : 'black'
              }}
            >
              <Box
                w="100%"
                zIndex={99}
                sx={{
                  '@md': { display: 'none' }
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
            </SafeAreaView>
          ) : null}

          <Box flex={1} ref={mainPanel}>
            <SafeAreaView
              style={{
                width: '100%',
                backgroundColor: colorMode == 'light' ? '#f3f4f6' : 'black'
              }}
            >
              <Outlet />
            </SafeAreaView>
          </Box>
        </HStack>
      </VStack>

      <ModalContext.Provider value={modalState}>
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            if (modal.onClose) {
              modal.onClose()
            }
          }}
        >
          <ModalBackdrop />
          <ModalContent>
            <ModalHeader>
              <Heading size="sm">{modal.title}</Heading>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody pb="$6">{modal.body}</ModalBody>
          </ModalContent>
        </Modal>
      </ModalContext.Provider>

      <AlertContext.Provider value={alertState}>
        {/*<Slide in={showAlert} placement="top"></Slide>*/}
        <Box
          sx={{
            '@base': {
              maxWidth: '100%',
              width: '100%',
              display: showAlert ? 'block' : 'none'
            },
            '@md': {
              _width: '$2/6',
              _marginLeft: '-$1/6',
              _left: '$1/2',
              width: isOpenSidebar
                ? 'calc(100vw - 80px)'
                : 'calc(100vw - 260px)',
              left: isOpenSidebar ? 80 : 260
            }
          }}
          flexWrap="wrap"
          position="fixed"
          top="$16"
          alignSelf="center"
        >
          <AppAlert
            title={alert.title}
            body={alert.body}
            type={alert.type}
            toggle={toggleAlert}
          />
        </Box>

        <ConfirmTrafficAlert
          title={confirmAlert.title}
          body={confirmAlert.body}
          type={confirmAlert.type}
          showAlert={showConfirmAlert}
          onClose={confirmAlert.onClose}
        />
      </AlertContext.Provider>
    </AppContext.Provider>
  )
}

export default AdminLayout
export { AlertContext }
