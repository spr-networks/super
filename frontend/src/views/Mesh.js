import React, { useContext, useEffect, useRef, useState } from 'react'
import { AlertContext } from 'AppContext'
import { copy } from 'utils'

import {
  Button,
  ButtonGroup,
  ButtonIcon,
  ButtonText,
  Box,
  Heading,
  HStack,
  FlatList,
  Text,
  Tooltip,
  VStack,
  AddIcon,
  CloseIcon,
  CopyIcon
} from '@gluestack-ui/themed'

import { RefreshCwIcon } from 'lucide-react-native'

import api, { wifiAPI, meshAPI, authAPI } from 'api'
import APIWifi from 'api/Wifi'

import APIMesh from 'api/mesh'

import ModalForm from 'components/ModalForm'
import AddLeafRouter from 'components/Mesh/AddLeafRouter'
import { ListHeader, ListItem } from 'components/List'
import TokenItem from 'components/TokenItem'

const Mesh = (props) => {
  const [leafRouters, setLeafRouters] = useState([])
  const [isLeafMode, setIsLeafMode] = useState([])
  const [config, setConfig] = useState({})
  const [leafToken, setLeafToken] = useState('')
  const [ssid, setSsid] = useState('')

  const [mesh, setMesh] = useState({})

  let alertContext = useContext(AlertContext)
  let refModal = useRef(null)

  const catchMeshErr = (err) => {
    alertContext.error(
      'Mesh API Failure',
      err?.message == 404 ? 'Is mesh plugin enabled?' : err
    )
  }

  const refreshLeaves = () => {
    retrieveLeafToken((token) => {
      setLeafToken(token)
    })

    meshAPI
      .leafMode()
      .then((result) => {
        setIsLeafMode(JSON.parse(result))
      })
      .catch(catchMeshErr)

    meshAPI
      .config()
      .then((result) => {
        setConfig(result)
      })
      .catch(catchMeshErr)

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
      .catch(catchMeshErr)
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
      .catch((err) => {})
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
        <VStack>
          <ListHeader
            title="Mesh Setup"
            description="This router is configured as a downlink with backhaul to a central SPR instance. You can reset it on this page."
          >
            <Button action="negative" onPress={() => doMeshReset()} mt="$4">
              <ButtonText>Reset Mesh</ButtonText>
              <ButtonIcon as={CloseIcon} ml="$1" />
            </Button>
          </ListHeader>

          <VStack>
            <Text isTruncated> ParentIP: {config.ParentIP}</Text>
            <Text isTruncated>
              Parent Notification Token: {config.ParentAPIToken}
            </Text>
          </VStack>
        </VStack>
      ) : (
        <VStack>
          <ListHeader
            title=" Mesh Setup"
            description="Configure downstream routers for mesh networking. Only wired backhaul is supported for now."
          >
            <ModalForm
              title="Add Leaf Router"
              triggerText="Add Leaf Router"
              modalRef={refModal}
            >
              <AddLeafRouter notifyChange={notifyChange} />
            </ModalForm>
          </ListHeader>

          <FlatList
            estimatedItemSize={100}
            data={leafRouters}
            ListHeaderComponent={() => {
              return leafRouters.length ? (
                <HStack
                  space="md"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Heading size="sm">Router IP</Heading>
                  <Heading size="sm">Status</Heading>
                  <Heading size="sm">Token</Heading>
                  <Text></Text>
                </HStack>
              ) : null
            }}
            renderItem={({ item }) => (
              <ListItem>
                <Text>{item.IP}</Text>
                {renderLeafStatus(item)}
                <Tooltip label={item.APIToken}>
                  <Button
                    action="secondary"
                    variant="link"
                    onPress={() => copy(item.APIToken)}
                  >
                    <ButtonIcon as={CopyIcon} />
                  </Button>
                </Tooltip>

                <Button
                  size="sm"
                  variant="link"
                  onPress={() => deleteListItem(item)}
                >
                  <ButtonIcon as={CloseIcon} />
                </Button>
              </ListItem>
            )}
            keyExtractor={(item) => `${item.IP}${item.APIToken}`}
          />

          <VStack space="md" p="$4">
            {!leafRouters.length ? (
              <Text>There are no leaf routers configured yet</Text>
            ) : null}

            <ButtonGroup
              flexDirection="column"
              sx={{ '@md': { flexDirection: 'row' } }}
            >
              <Button
                sx={{
                  '@md': { display: leafRouters.length ? 'none' : 'flex' }
                }}
                action="primary"
                onPress={() => refModal.current()}
              >
                <ButtonText>Add Leaf Router</ButtonText>
                <ButtonIcon as={AddIcon} ml="$1" />
              </Button>

              <Button action="secondary" onPress={() => doSyncSSID()}>
                <ButtonText>Sync SSID Across Devices: {ssid}</ButtonText>
                <ButtonIcon as={RefreshCwIcon} ml="$1" />
              </Button>
            </ButtonGroup>
          </VStack>

          {leafRouters.length == 0 ? (
            <>
              <ListHeader
                title="Device Token"
                description="Generate an API token to use this device as a leaf router."
              ></ListHeader>

              <Box
                bg="$backgroundCardLight"
                sx={{
                  _dark: { bg: '$backgroundCardDark' }
                }}
                p="$4"
              >
                {leafToken == '' ? (
                  <Button
                    action="secondary"
                    onPress={() => generateLeafToken()}
                    mt="$4"
                  >
                    <ButtonText>Generate API Token</ButtonText>
                    <ButtonIcon as={AddIcon} ml="$1" />
                  </Button>
                ) : (
                  <HStack
                    justifyContent="space-between"
                    alignItems="center"
                    p="$4"
                  >
                    <Text color="$muted500">API-Token</Text>
                    <TokenItem token={leafToken} />
                  </HStack>
                )}
              </Box>
            </>
          ) : null}
        </VStack>
      )}
    </>
  )
}

export default Mesh
