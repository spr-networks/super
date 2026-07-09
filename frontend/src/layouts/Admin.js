import React, { useEffect, useState } from 'react'
import { Dimensions, Platform, SafeAreaView } from 'react-native'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'

import Notifications from 'Notifications'
import { logNotification } from 'NotificationsLog'
import {
  AppContext,
  AlertContext,
  alertState,
  ModalContext,
  modalState
} from 'AppContext'
import AdminNavbar from 'components/Navbars/AdminNavbar'
import Sidebar from 'components/Sidebar/Sidebar'
import { WebSocketComponent } from 'api/WebSocket'
import {
  api,
  deviceAPI,
  meshAPI,
  pfwAPI,
  pluginAPI,
  themeAPI,
  wifiAPI
} from 'api'
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

import CustomPluginView from 'views/CustomPlugin'
import DeviceInfo from 'DeviceInfo'

//NOTE Slice transition for Alerts not available in gluestack-ui

import { routes as allRoutes } from 'routes'
import { pluginMenuIcon } from 'components/Plugins/PluginIcons'

import { KeyboardAvoidingView } from '@gluestack-ui/themed'
import OTPValidate from 'components/Auth/OTPValidate'
import { themes, customIdForName } from 'Themes'

const ConfirmTrafficAlert = (props) => {
  const { type, title, body, showAlert, onClose } = props

  const safeClose = (action) => {
    if (typeof onClose === 'function') onClose(action)
  }
  const onPressDeny = () => safeClose('deny')
  const onPressAllow = () => safeClose('allow')
  const onPressClose = () => safeClose('cancel')

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
    <Alert action={alertType} rounded="$none">
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

const AdminLayout = ({
  setColorMode,
  theme,
  setTheme,
  customThemes,
  setCustomThemes,
  ...props
}) => {
  const mainPanel = React.useRef()
  const location = useLocation()
  const navigate = useNavigate()

  const [showAlert, setShowAlert] = useState(false)
  const [showConfirmAlert, setShowConfirmAlert] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [alert, setAlert] = useState({})
  const [confirmAlert, setConfirmAlert] = useState({})
  const [modal, setModal] = useState({})

  const toggleAlert = () => setShowAlert(!showAlert)

  //setup alert context
  alertState.alert = (type = 'info', title, body = null) => {
    if (!body) {
      body = title
      title = ucFirst(type)
    }

    const alertFunc = (type, title, body) => {
      // web desktop notification
      if (['error', 'success'].includes(type) && Platform.OS == 'web') {
        Notifications.notification(title, body)
      }

      logNotification(type, title, body)

      setAlert({ type, title, body })
      setShowAlert(true)

      // auto hide if not a confirm dialog
      setTimeout((_) => setShowAlert(false), 5e3)
    }

    // error response from api - get error msg instead of status
    if (body && typeof body == 'object' && body?.response !== undefined) {
      body.response
        .text()
        .then((data) => {
          alertFunc(type, title, data)
        })
        .catch((err) => {
          alertFunc(type, title, JSON.stringify(body))
        })
    } else {
      //handle if react elems or not
      if (body && typeof body == 'object' && !body?.props) {
        body = body.toString()
      }

      alertFunc(type, title, body)
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
  const [isSimpleMode, setIsSimpleMode] = useState(false)
  const [isWifiDisabled, setIsWifiDisabled] = useState(null)
  const [isPlusDisabled, setIsPlusDisabled] = useState(true)
  const [isMeshNode, setIsMeshNode] = useState(false)
  const [isFeaturesInitialized, setIsFeaturesInitialized] = useState(false)
  const [version, setVersion] = useState('default')
  const [features, setFeatures] = useState([])
  const [devices, setDevices] = useState([])
  const [groups, setGroups] = useState([])
  const [routes, setRoutes] = useState(allRoutes)

  // device context stuff
  const getDevices = (forceFetch = false) => {
    return new Promise((resolve, reject) => {
      if (!forceFetch && devices?.length) {
        return resolve(devices)
      }

      deviceAPI
        .list()
        .then((devices_) => {
          setDevices(Object.values(devices_))
          const uniqueGroups = [
            ...new Set(Object.values(devices_).flatMap((d) => d.Groups))
          ]
          setGroups(uniqueGroups)
          resolve(Object.values(devices_))
          //store version in asyncstore for cache in notification handler
          AsyncStorage.setItem(
            'devices',
            JSON.stringify(Object.values(devices_))
          )
        })
        .catch(reject)
    })
  }

  const getDevice = (value, type = 'MAC') => {
    if (!value) return null
    return devices.find((d) => d[type] == value)
  }

  const getGroups = () => {
    return new Promise((resolve, reject) => {
      getDevices()
        .then((d) => {
          return resolve(groups)
        })
        .catch(reject)
    })
  }

  const registerPluginRoutes = () => {
    if (routes.filter((r) => r.name == 'Custom Plugins')?.length) {
      return
    }

    pluginAPI
      .list()
      .then((plugins) => {
        let pluginsWithUI = plugins.filter((p) => p.HasUI)
        let pluginRoutes = pluginsWithUI.map((p) => ({
          layout: 'admin',
          name: p.Name,
          path: `custom_plugin/${encodeURIComponent(p.URI)}/`,
          icon: pluginMenuIcon(p.Icon),
          Component: CustomPluginView,
          isSandboxed: p.SandboxedUI
        }))

        if (pluginRoutes.length) {
          let routesNav = {
            name: 'Custom Plugins',
            state: 'customPluginsCollape',
            views: pluginRoutes
          }

          setRoutes([...routes, routesNav])
        }
      })
      .catch((err) => {})
  }

  //main init here
  useEffect(() => {
    //global handlers for api errors
    api.registerErrorHandler(404, (err) => {
      //console.error('HTTP error 404', err.response.url)
    })

    const redirOnAuthError = (err) => {
      let url = err.response.url
      console.error('HTTP auth error for url:', url)

      //custom handler for /admin/auth page
      if (url.endsWith('/tokens')) {
        //NOTE we have a custom .catch on tokens page
      } else {
        modalState.modal(
          'OTP Validate',
          <OTPValidate
            onSuccess={() => {
              modalState.setShowModal(false)
              // Trigger a custom event to notify about OTP validation success
              window.dispatchEvent(new Event('otp-validated'))
            }}
            onSetup={() => {
              modalState.setShowModal(false)
              navigate('/admin/auth')
            }}
          />
        )
      }
    }

    api.registerErrorHandler(401, redirOnAuthError)
    api.registerErrorHandler(403, redirOnAuthError)

    api
      .features()
      .then((res) => {
        setFeatures([...res])
        setIsWifiDisabled(!res.includes('wifi'))
        meshAPI
          .leafMode()
          .then((res) => {
            setIsMeshNode(JSON.parse(res) === true)
            setIsFeaturesInitialized(true)
          })
          .catch((err) => {
            console.log(err)
            setIsFeaturesInitialized(true)
          })
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

    // cache devices
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

    // store info if ios
    if (Platform.OS == 'ios') {
      DeviceInfo.saveDeviceInfo()
    } else if (Platform.OS == 'web') {
      //Notifications.init({})

      // add routes with plugins on web
      registerPluginRoutes()
    }
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
              `hostapd for ${iface} failed to start - check wifid service logs`
            )
          })
      })
      .catch((err) => {
        alertState.error(
          'could not find a default wireless interface - check wifid service logs'
        )
      })
  }, [isWifiDisabled])

  const colorMode = useColorMode()

  //View settings: colorMode, simpleMode. TODO: move more to App
  const [viewSettings, setViewSettings] = useState(null)
  const skipNextSettingsSave = React.useRef(false)

  const loadSettings = () => {
    AsyncStorage.getItem('settings')
      .then((settings) => {
        let defaultSettings = { colorMode: 'light', isSimpleMode: true }

        let viewSettings = JSON.parse(settings) || defaultSettings
        setViewSettings(viewSettings)

        setIsSimpleMode(viewSettings.isSimpleMode)
      })
      .catch((err) => {
        console.error('ERR:', err)
      })
  }

  const settingsForSave = (settings = {}, preserveTheme = false) => ({
    ...(settings || {}),
    theme: preserveTheme ? settings?.theme || theme : theme,
    colorMode: preserveTheme ? settings?.colorMode || colorMode : colorMode
  })

  const saveSettings = (settings = viewSettings, preserveTheme = false) => {
    AsyncStorage.setItem(
      'settings',
      JSON.stringify(settingsForSave(settings, preserveTheme))
    )
      .then((res) => {})
      .catch((err) => {})
  }

  const persistSettings = (settings) => {
    let next = settingsForSave(settings, true)
    skipNextSettingsSave.current = true
    setViewSettings(next)
    saveSettings(next, true)
  }

  useEffect(() => {
    if (!viewSettings) {
      loadSettings()
      return
    }

    setViewSettings(settingsForSave({ ...viewSettings, isSimpleMode }))
  }, [isSimpleMode])

  useEffect(() => {
    if (viewSettings) {
      if (skipNextSettingsSave.current) {
        skipNextSettingsSave.current = false
        return
      }
      saveSettings()
    }
  }, [viewSettings])

  const themeColors = customThemes[theme]?.colors || themes[theme]?.colors || {}
  const pick = (light, dark, litLight, litDark) =>
    colorMode === 'light'
      ? themeColors[light] || litLight
      : themeColors[dark] || litDark
  const backgroundColor = pick(
    'navbarBackgroundLight',
    'navbarBackgroundDark',
    'white',
    'black'
  )
  const contentBackground = pick(
    'backgroundContentLight',
    'backgroundContentDark',
    '#f3f4f6',
    'black'
  )
  const sidebarBackground = pick(
    'sidebarBackgroundLight',
    'sidebarBackgroundDark',
    '#f9fafb',
    'black'
  )

  const setThemeHook = (name, mode) => {
    let next = {
      ...(viewSettings || {}),
      isSimpleMode,
      theme: name,
      colorMode: mode || colorMode
    }
    persistSettings(next)
    setTheme(name)
    if (mode && setColorMode) {
      setColorMode(mode)
    }
  }

  const syncThemesToAPI = (next) => {
    themeAPI.save(Object.values(next)).catch((err) => {
      alertState.error('Failed to save themes to API', err.message)
    })
  }

  const saveCustomTheme = (name, spec) => {
    let id = customIdForName(name)
    let baseSettings = viewSettings || {}
    let next = {
      ...(baseSettings.customThemes || {}),
      [id]: { id, name, spec }
    }
    persistSettings({ ...baseSettings, customThemes: next, theme: id })
    setCustomThemes(next)
    setTheme(id)
    syncThemesToAPI(next)
  }

  const deleteCustomTheme = (id) => {
    let baseSettings = viewSettings || {}
    let next = { ...(baseSettings.customThemes || {}) }
    delete next[id]
    let wasActive = theme === id
    let patch = { ...baseSettings, customThemes: next }
    if (wasActive) {
      patch.theme = 'default'
      patch.colorMode = 'light'
    }
    persistSettings(patch)
    setCustomThemes(next)
    if (wasActive) {
      setTheme('default', 'light')
      if (setColorMode) setColorMode('light')
    }
    syncThemesToAPI(next)
  }

  useEffect(() => {
    themeAPI
      .list()
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return
        let next = {}
        list.forEach((t) => {
          if (t?.id) next[t.id] = t
        })
        setCustomThemes((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        )
      })
      .catch(() => {})
  }, [])

  const webConfirm = (title, body, data) => {
    alertState.confirm(title, body, (action) => {
      setShowConfirmAlert(false)

      confirmTrafficAction(action, data)
    })
  }

  const webNotify = (type, title, body) => {
    alertState[type](title, body)
  }

  const iosConfirm = (title, body, data) => {
    Notifications.confirm(title, body, data)
  }

  const iosNotify = (type, title, body) => {
    Notifications.notification(title, body)
  }

  const doConfirm = (title, body, data) => {
    if (Platform.OS == 'ios') {
      iosConfirm(title, body, data)
    } else {
      webConfirm(title, body, data)
    }
  }

  const doNotify = (type, title, body) => {
    if (Platform.OS == 'ios' && ['danger', 'warning'].includes(type)) {
      iosNotify(type, title, body)
    } else {
      webNotify(type, title, body)
    }
  }

  return (
    <AppContext.Provider
      value={{
        activeSidebarItem,
        setActiveSidebarItem,
        isNavbarOpen,
        setIsNavbarOpen,
        isSimpleMode,
        setIsSimpleMode,
        isWifiDisabled,
        isPlusDisabled,
        isMeshNode,
        isFeaturesInitialized,
        features,
        devices,
        getDevices,
        getDevice,
        getGroups,
        viewSettings,
        setViewSettings,
        theme,
        setTheme: setThemeHook,
        customThemes,
        saveCustomTheme,
        deleteCustomTheme
      }}
    >
      <WebSocketComponent notify={doNotify} confirm={doConfirm} />

      <KeyboardAvoidingView behavior="height" flex={1}>
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
          {/*desktop - web only; iOS always uses the mobile navbar below*/}
          {Platform.OS === 'web' && (
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
                setColorMode={setColorMode}
                theme={theme}
                setTheme={setThemeHook}
                customThemes={customThemes}
              />
            </Box>
          )}
          {/*mobile - always rendered; web hides it at @md widths*/}
          <Box
            display="flex"
            position={Platform.OS == 'web' ? 'sticky' : 'static'}
            sx={Platform.OS == 'web' ? { '@md': { display: 'none' } } : {}}
            top={0}
            zIndex={99}
          >
            <AdminNavbar
              version={version}
              isMobile={true}
              isOpenSidebar={isOpenSidebar}
              setIsOpenSidebar={setIsOpenSidebar}
              setColorMode={setColorMode}
              theme={theme}
              setTheme={setThemeHook}
              customThemes={customThemes}
            />
          </Box>

          <HStack
            position={Platform.OS == 'web' ? 'sticky' : 'static'}
            top={Platform.OS == 'web' ? 16 : 0}
            flex={1}
          >
            {/*desktop sidebar - web only at >= md widths; iOS uses mobile sidebar*/}
            {Platform.OS === 'web' && (
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
                  isOpenSidebar={isOpenSidebar}
                  setIsOpenSidebar={setIsOpenSidebar}
                  isSimpleMode={isSimpleMode}
                  setIsSimpleMode={setIsSimpleMode}
                  theme={theme}
                  setTheme={setThemeHook}
                  routes={routes}
                />
              </Box>
            )}
            {/*mobile*/}
            {isOpenSidebar ? (
              <Box
                w="100%"
                zIndex={99}
                sx={Platform.OS == 'web' ? { '@md': { display: 'none' } } : {}}
              >
                <SafeAreaView
                  style={{
                    width: '100%',
                    backgroundColor: sidebarBackground
                  }}
                >
                  <Sidebar
                    isMobile={true}
                    isMini={false}
                    isOpenSidebar={isOpenSidebar}
                    setIsOpenSidebar={setIsOpenSidebar}
                    isSimpleMode={isSimpleMode}
                    setIsSimpleMode={setIsSimpleMode}
                    theme={theme}
                    setTheme={setThemeHook}
                    routes={routes}
                  />
                </SafeAreaView>
              </Box>
            ) : null}

            <Box flex={1} ref={mainPanel}>
              <SafeAreaView
                style={{
                  width: '100%',
                  backgroundColor: contentBackground
                }}
              >
                <Outlet />
              </SafeAreaView>
            </Box>
          </HStack>
        </VStack>
      </KeyboardAvoidingView>

      <ModalContext.Provider value={modalState}>
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            if (modal.onClose) {
              modal.onClose()
            }
          }}
          useRNModal={Platform.OS == 'web'}
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
              display: showAlert ? 'flex' : 'none',
              bottom: '14%'
            },
            '@md': {
              width: isOpenSidebar
                ? 'calc(100vw - 80px)'
                : 'calc(100vw - 260px)',
              left: isOpenSidebar ? 80 : 260,
              bottom: '$16'
            }
          }}
          flexWrap="wrap"
          position="absolute"
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
