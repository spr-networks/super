import React, { useContext, useEffect, useRef, useState } from 'react'
import { AlertContext } from 'AppContext'

import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'

import {
  faCirclePlus,
  faPlus,
  faRefresh,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Button,
  Box,
  Heading,
  HStack,
  FlatList,
  IconButton,
  Input,
  Text,
  useColorModeValue,
  View,
  VStack
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

import api, { wifiAPI, meshAPI, authAPI } from 'api'
import APIWifi from 'api/Wifi'

import APIMesh from 'api/mesh'

import ModalForm from 'components/ModalForm'
import AddLeafRouter from 'components/Mesh/AddLeafRouter'

const Mesh = (props) => {
  const [leafRouters, setLeafRouters] = useState([])
  const [isLeafMode, setIsLeafMode] = useState([])
  const [config, setConfig] = useState({})
  const [leafToken, setLeafToken] = useState('')
  const [ssid, setSsid] = useState('')

  const [mesh, setMesh] = useState({})

  let alertContext = useContext(AlertContext)
  let refModal = useRef(null)

  const refreshLeaves = () => {
    retrieveLeafToken((token) => {
      setLeafToken(token)
    })

    meshAPI
      .leafMode()
      .then((result) => {
        setIsLeafMode(JSON.parse(result))
      })
      .catch((err) => {
        alertContext.error('Mesh API Failure', err)
      })

    meshAPI
      .config()
      .then((result) => {
        setConfig(result)
      })
      .catch((err) => {
        alertContext.error('Mesh API Failure', err)
      })

    meshAPI
      .leafRouters()
      .then((routers) => {
        if (routers == null) {
          return
        }

        for (let i = 0; i < routers.length; i++) {
          routers[i].status = 'Unknown'
        }
        setLeafRouters(routers)

        let checkedRouters = routers.map(async (router) => {
          let rApi = new api()
          rApi.setRemoteURL('http://' + router.IP + '/')
          rApi.setAuthTokenHeaders(router.APIToken)

          return rApi
            .get('/status')
            .then((result) => {
              router.status = 'API OK'

              let rMeshAPI = new APIMesh()
              //if API is okay, reach further.
              rMeshAPI.setRemoteURL('http://' + router.IP + '/')
              rMeshAPI.setAuthTokenHeaders(router.APIToken)

              return rMeshAPI
                .leafMode()
                .then((result) => {
                  let val = JSON.parse(result)
                  if (val == true) {
                    router.status = 'Mesh Enabled'
                  } else {
                    router.status = 'Mesh Leaf Not Enabled'
                  }
                  return router
                })
                .catch((e) => {
                  router.status = 'Mesh API down'
                  return router
                })
              return router
            })
            .catch((err) => {
              router.status = 'Offline'
              return router
            })
        })

        Promise.all(checkedRouters)
          .then((results) => {
            setLeafRouters(results)
          })
          .catch((e) => {
            alertContext.error('Remote API Failure', e)
          })
      })
      .catch((err) => {
        alertContext.error('Mesh API Failure', err)
      })
  }

  useEffect(() => {
    refreshLeaves()

    wifiAPI
      .interfacesConfiguration()
      .then((ifaces) => {
        for (let iface of ifaces) {
          if (!iface.Enabled || iface.Type != 'AP') {
            continue
          }
          wifiAPI
            .status(iface.Name)
            .then((status) => {
              setSsid(status['ssid[0]'])
            })
            .catch((err) => {
              alertContext.error('Mesh API fail to sync SSIDs')
            })
        }
      })
      .catch((err) => {})

    function updateX(k, prevState, x) {
      let prev = prevState[k]
      if (prev) {
        let prevs = Object.keys(prev)
        for (let i = 0; i < prevs.length; i++) {
          if (x[k][prevs[i]] == undefined) {
            x[k][prevs[i]] = prev[prevs[i]]
          }
        }
      }
      return { ...prevState, ...x }
    }

    wifiAPI.interfacesConfiguration().then((config) => {
      config.forEach((iface) => {
        if (iface.Type == 'AP' && iface.Enabled == true) {
          wifiAPI
            .allStations(iface.Name)
            .then((stations) => {
              let x = { '192.168.2.1': { [iface.Name]: Object.keys(stations) } }
              setMesh((prevState, props) =>
                updateX('192.168.2.1', prevState, x)
              )
            })
            .catch((err) => {
              console.log('WIFI API Failure', err)
            })
        }
      })
    })

    meshAPI
      .meshIter(() => new APIWifi())
      .then((r) =>
        r.forEach((remoteWifiApi) => {
          remoteWifiApi.interfacesConfiguration
            .call(remoteWifiApi)
            .then((config) => {
              config.forEach((iface) => {
                if (iface.Type == 'AP' && iface.Enabled == true) {
                  remoteWifiApi.allStations
                    .call(remoteWifiApi, iface.Name)
                    .then((stations) => {
                      console.log(
                        'do it ... ' +
                          remoteWifiApi.remoteURL +
                          ' ' +
                          iface.Name
                      )

                      let x = {
                        [remoteWifiApi.remoteURL]: {
                          [iface.Name]: Object.keys(stations)
                        }
                      }
                      setMesh((prevState, props) =>
                        updateX(remoteWifiApi.remoteURL, prevState, x)
                      )
                    })
                    .catch((err) => {
                      console.log(
                        'WIFI API Failure ' +
                          remoteWifiApi.remoteURL +
                          ' ' +
                          iface.Name
                      )
                      console.log(err)
                    })
                }
              })
            })
        })
      )
  }, [])

  const deleteListItem = (item) => {
    const done = (res) => {
      refreshLeaves()
    }

    meshAPI.delLeafRouter(item).then(done)
  }

  const notifyChange = (t) => {
    if (refModal && refModal.current) {
      refModal.current()
    }
    if (props.notifyChange) {
      props.notifyChange('mesh')
    }
    refreshLeaves()
  }

  const renderLeafStatus = (item) => {
    return <Text>{item.status}</Text>
  }

  const doMeshReset = () => {
    meshAPI
      .setLeafMode('disable')
      .then((result) => {
        let a = new api()
        a.restart()
        notifyChange()
      })
      .catch((e) => {
        alertContext.error('Mesh API fail to disable mesh mode')
      })
  }

  const doSyncSSID = () => {
    if (ssid == '') {
      return
    }
    meshAPI.setSSID(ssid).then((result) => {})
  }

  const retrieveLeafToken = (func) => {
    authAPI
      .tokens()
      .then((tokens) => {
        let name = 'PLUS-MESH-API-DOWNHAUL-TOKEN'
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].Name == name) {
            func(tokens[i].Token)
            return
          }
        }
        func('')
      })
      .catch((e) => {
        alertContext.error('Could not list API Tokens')
      })
  }

  const generateLeafToken = () => {
    retrieveLeafToken((t) => {
      if (t == '') {
        let name = 'PLUS-MESH-API-DOWNHAUL-TOKEN'
        authAPI
          .putToken(name, 0)
          .then((token) => {
            setLeafToken(token.Token)
          })
          .catch((e) => {
            alertContext.error('Could not generate API Token')
          })
      }
    })
  }

  return (
    <>
      {isLeafMode == true ? (
        <>
          <HStack justifyContent="space-between" alignItems="center" p={4}>
            <VStack maxW="60%">
              <Heading fontSize="md" isTruncated>
                Mesh Setup
              </Heading>
              <Text color="muted.500" isTruncated>
                This router is configured as a downlink with backhaul to a
                central SPR instance. You can reset it on this page.
              </Text>
              <Text isTruncated> ParentIP: {config.ParentIP} </Text>
              <Text isTruncated>
                {' '}
                Parent Notification Token: {config.ParentAPIToken}{' '}
              </Text>

              <Button
                display={{ base: 'flex', md: 'flex' }}
                variant={useColorModeValue('subtle', 'solid')}
                colorScheme="warning"
                leftIcon={<Icon icon={faXmark} />}
                onPress={() => doMeshReset()}
                mt={4}
              >
                Reset Mesh
              </Button>
            </VStack>
          </HStack>
        </>
      ) : (
        <>
          <HStack justifyContent="space-between" alignItems="center" p={4}>
            <VStack maxW="60%">
              <Heading fontSize="md" isTruncated>
                Mesh Setup
              </Heading>
              <Text color="muted.500" isTruncated>
                Configure downstream routers for mesh networking. Only wired
                backhaul is supported for now.
              </Text>
            </VStack>
            <ModalForm
              title={`Add Leaf Router`}
              triggerText="Add Leaf Router"
              modalRef={refModal}
            >
              <AddLeafRouter notifyChange={notifyChange} />
            </ModalForm>
          </HStack>

          <Box
            bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
            rounded="md"
            p={4}
            mx={4}
          >
            <FlatList
              estimatedItemSize={100}
              data={leafRouters}
              ListHeaderComponent={() => {
                return leafRouters.length ? (
                  <HStack
                    space={3}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Heading fontSize="sm">Router IP</Heading>
                    <Heading fontSize="sm">Status</Heading>
                    <Heading fontSize="sm">Token</Heading>
                    <Text></Text>
                  </HStack>
                ) : null
              }}
              renderItem={({ item }) => (
                <Box
                  borderBottomWidth={1}
                  _dark={{
                    borderColor: 'muted.600'
                  }}
                  borderColor="muted.200"
                  py={2}
                >
                  <HStack
                    space={3}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text>{item.IP}</Text>
                    {renderLeafStatus(item)}
                    <Text>{item.APIToken}</Text>

                    <IconButton
                      alignSelf="center"
                      size="sm"
                      variant="ghost"
                      colorScheme="secondary"
                      icon={<Icon icon={faXmark} />}
                      onPress={() => deleteListItem(item)}
                    />
                  </HStack>
                </Box>
              )}
              keyExtractor={(item) => `${item.IP}${item.APIToken}`}
            />

            <VStack>
              {!leafRouters.length ? (
                <Text alignSelf={'center'}>
                  There are no leaf routers configured yet
                </Text>
              ) : null}
              <Button
                display={{
                  base: 'flex',
                  md: leafRouters.length ? 'none' : 'flex'
                }}
                variant={useColorModeValue('subtle', 'solid')}
                colorScheme="muted"
                leftIcon={<Icon icon={faCirclePlus} />}
                onPress={() => refModal.current()}
                mt={4}
              >
                Add Leaf Router
              </Button>

              <Button
                display={{ base: 'flex', md: 'flex' }}
                variant={useColorModeValue('subtle', 'solid')}
                colorScheme="muted"
                leftIcon={<Icon icon={faRefresh} />}
                onPress={() => doSyncSSID()}
                mt={4}
              >
                <HStack space={2} alignItems="center">
                  <Text>Sync SSID Across Devices</Text>
                  <Badge colorScheme="primary">{ssid}</Badge>
                </HStack>
              </Button>
            </VStack>
          </Box>

          {leafRouters.length == 0 ? (
            <>
              <VStack p={4} space={1}>
                <Heading fontSize="md">Device Token</Heading>
                <Text color="muted.500" isTruncated>
                  Generate an API token to use this device as a leaf router.
                </Text>
              </VStack>

              <Box
                bg={useColorModeValue(
                  'backgroundCardLight',
                  'backgroundCardDark'
                )}
                rounded="md"
                p={4}
                mx={4}
              >
                <VStack>
                  {leafToken == '' ? (
                    <Button
                      display={{ md: 'flex' }}
                      variant={useColorModeValue('subtle', 'solid')}
                      colorScheme="muted"
                      leftIcon={<Icon icon={faCirclePlus} />}
                      onPress={() => generateLeafToken()}
                      mt={4}
                    >
                      Generate API Token
                    </Button>
                  ) : (
                    <HStack
                      justifyContent="space-between"
                      alignItems="center"
                      p={4}
                    >
                      <Text color="muted.500">API-Token</Text>
                      <Text>{leafToken}</Text>
                    </HStack>
                  )}
                </VStack>
              </Box>
            </>
          ) : null}
        </>
      )}
    </>
  )
}

export default Mesh
