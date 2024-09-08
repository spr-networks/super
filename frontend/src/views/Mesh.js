import React, { useContext, useEffect, useRef, useState } from 'react'
import { AlertContext } from 'AppContext'
import { copy } from 'utils'
import { useNavigate } from 'react-router-dom'

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
  Spinner,
  Tooltip,
  VStack,
  AddIcon,
  CloseIcon,
  CopyIcon
} from '@gluestack-ui/themed'

import ModalForm from 'components/ModalForm'
import AddLeafRouter from 'components/Mesh/AddLeafRouter'
import { ListHeader, ListItem } from 'components/List'
import TokenItem from 'components/TokenItem'


import { RefreshCwIcon } from 'lucide-react-native'

import api, { wifiAPI, meshAPI, authAPI, setAuthReturn } from 'api'
import APIMesh from 'api/mesh'

const Mesh = (props) => {
  const [leafRouters, setLeafRouters] = useState([])
  const [isLeafMode, setIsLeafMode] = useState([])
  const [config, setConfig] = useState({})
  const [leafToken, setLeafToken] = useState('')
  const [ssid, setSsid] = useState('')

  let [meshAvailable, setMeshAvailable] = useState(true)
  let [spinning, setSpinning] = useState(false)

  let alertContext = useContext(AlertContext)
  let refModal = useRef(null)
  const navigate = useNavigate()

  const meshProtocol = () => {
      //return 'https:'
      return window.location.protocol
  }

  const catchMeshErr = (err) => {
    setSpinning(false)
    if (err?.message == 404 || err?.message == 502) {
      setMeshAvailable(false)
      return
    }
    alertContext.error(
      'Mesh API Failure',
      err?.message == 404 ? 'Is mesh plugin enabled?' : err
    )
    setSpinning(false)
  }

  const refreshLeaves = () => {
    meshAPI
      .leafMode()
      .then((result) => {
        let r = JSON.parse(result)
        setIsLeafMode(r)
        if (r == true) {
          retrieveLeafToken((token) => {
            setLeafToken(token)
          })
        }
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

        //tbd refactor with meshIter

        let checkedRouters = routers.map(async (router) => {
          let rApi = new api()
          rApi.setRemoteURL(meshProtocol() + '//' + router.IP + '/')
          rApi.setAuthTokenHeaders(router.APIToken)

          return rApi
            .get('/version')
            .then((version) => {
              router.status = 'API OK'
              router.version = version

              let rMeshAPI = new APIMesh()
              //if API is okay, reach further.
              rMeshAPI.setRemoteURL(meshProtocol() + '//' + router.IP + '/')
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

        setSpinning(true)

        Promise.all(checkedRouters)
          .then((results) => {
            setLeafRouters(results)
            setSpinning(false)
          })
          .catch((e) => {
            alertContext.error('Remote API Failure', e)
            setSpinning(false)
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

  }, [])

  const deleteListItem = (item) => {
    setSpinning(true)
    const done = (res) => {
      refreshLeaves()
      setSpinning(false)
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
    meshAPI.setSSID(ssid).then((result) => {}).catch((e) => {
      alertContext.error('Mesh API failed to sync ssids')
    })
  }

  const doSyncOTP = () => {
    meshAPI.syncOTP().then((result) => {}).catch((e) => {
      alertContext.error('Mesh API failed to sync otp')
    })
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
        alertContext.error('Could not list API Tokens. Verify OTP on Auth page')
        setAuthReturn('/admin/auth')
        navigate('/auth/validate')
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
      } else {
        setLeafToken(t)
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
      ) : meshAvailable ? (
        <VStack>
          <ListHeader
            title=" Mesh Setup"
            description="Configure Access Points for mesh networking. Only wired backhaul is supported for now."
          >
            <ModalForm
              title="Add Mesh Node AP"
              triggerText="Add Mesh Node AP"
              triggerProps={{
                sx: {
                  '@base': { display: 'none' },
                  '@md': { display: leafRouters.length ? 'flex' : 'flex' }
                }
              }}
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
                  <Heading size="sm">SPR Version</Heading>
                  <Heading size="sm">Token</Heading>
                  <Text></Text>
                </HStack>
              ) : null
            }}
            renderItem={({ item }) => (
              <ListItem>
                <Text flex={2}>{item.IP}</Text>
                <Text flex={3}>{item.status}</Text>
                <Text flex={2}>{item.version}</Text>
                <TokenItem flex={2} token={item.APIToken} />
                <Button
                  size="sm"
                  variant="link"
                  onPress={() => deleteListItem(item)}
                  flex={1}
                >
                  <ButtonIcon as={CloseIcon} />
                </Button>
              </ListItem>
            )}
            keyExtractor={(item) => `${item.IP}${item.APIToken}`}
          />

          <VStack space="md" p="$4">
            {!leafRouters.length ? (
              <Text>There are no mesh Access Points configured yet</Text>
            ) : null}

            { spinning && (
              <Spinner size="medium" />
            )}

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
                <ButtonText>Add Mesh Access Point</ButtonText>
                <ButtonIcon as={AddIcon} ml="$1" />
              </Button>
            </ButtonGroup>

            {leafRouters.length > 0 && (

            <VStack>
              <Button mt="$4"  action="secondary" onPress={() => doSyncSSID()}>
                <ButtonText>Sync SSID Across Access Points: {ssid}</ButtonText>
                <ButtonIcon as={RefreshCwIcon} ml="$1" />
              </Button>
              <Button mt="$4" action="secondary" onPress={() => doSyncOTP()}>
                <ButtonText>Sync OTP Code Across Access Points</ButtonText>
                <ButtonIcon as={RefreshCwIcon} ml="$1" />
              </Button>
            </VStack>
            )}
          </VStack>

          {leafRouters.length == 0 ? (
            <>
              <ListHeader
                title="Device Token"
                description="Generate an API token to use this device as a mesh Access Point."
              ></ListHeader>

              <Box
                bg="$backgroundCardLight"
                sx={{
                  _dark: { bg: '$backgroundCardDark' }
                }}
                p="$4"
              >
                <Text color="$muted500">Configure Mesh Node:</Text>
                {leafToken == '' ? (
                  <Button
                    action="secondary"
                    onPress={() => generateLeafToken()}
                    mt="$4"
                  >
                    <ButtonText>Generate Mesh Node Token</ButtonText>
                  </Button>
                ) : (
                  <HStack
                    p="$4"
                    justifyContent="flex-start"
                    alignItems="center"
                    space="md"
                  >
                    <Text color="$muted500">API-Token</Text>
                    <TokenItem token={leafToken} />
                  </HStack>
                )}
              </Box>
            </>
          ) : null}
        </VStack>
      ) : (
        <Text p="$4"> Mesh plugin not enabled </Text>
      )}
    </>
  )
}

export default Mesh
