import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, wifiAPI, saveLogin } from 'api'
import { generateConfigForBand, getBestWifiConfig, isSPRCompat } from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import AddDevice from 'components/Setup/AddDevice'
import { countryCodes } from 'utils'
import { Tooltip } from 'components/Tooltip'

import {
  Button,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CheckIcon,
  Link,
  Heading,
  HStack,
  Icon,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  InputIcon,
  ButtonText,
  InputSlot,
  FormControlError,
  FormControlErrorText,
  InfoIcon,
  ScrollView,
  Spinner,
  Text,
  View,
  VStack,
  useColorMode,
  Badge,
  BadgeText,
  BadgeIcon
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

import { AlertContext } from 'AppContext'
import {
  AlertCircle,
  AlertCircleIcon,
  BookOpenTextIcon,
  CheckCircleIcon,
  KeyRoundIcon,
  WifiIcon
} from 'lucide-react-native'

const AlertError = (props) => {
  return <>{props.alertBody && <Text>{props.alertBody}</Text>}</>
}

const ApiLoading = (props) => {
  const navigate = useNavigate()

  if (props.online) {
    return <></>
  }
  return (
    <HStack space="sm" alignSelf="center" alignItems="center">
      <Spinner size="small" />
      <Tooltip
        label={'Reload the page or reconnect to the SPR Setup AP'}
        onPress={() => navigate('/auth/setup')}
      >
        <Text size="md">API Loading...</Text>
      </Tooltip>
    </HStack>
  )
}

const SetupScrollView = ({ children, ...props }) => {
  return (
    <ScrollView h="$full" w="$full" sx={{ '@md': { h: '92vh', pb: '$8' } }}>
      <View
        h="$full"
        px="$4"
        bg="$white"
        sx={{
          _dark: { bg: '$blueGray900' },
          '@md': {
            rounded: 10,
            w: '60%',
            mt: '$8',
            px: '$8',
            alignSelf: 'center'
          }
        }}
      >
        <VStack space="md" my="$4">
          {children}
        </VStack>
      </View>
    </ScrollView>
  )
}

const ButtonSetup = ({ children, ...props }) => (
  <Button
    rounded="$full"
    bg="#fbc658"
    sx={{
      _hover: {
        bg: '#fab526'
      }
    }}
    {...props}
  >
    {children}
  </Button>
)

const Setup = (props) => {
  const context = useContext(AlertContext)

  const navigate = useNavigate()
  const [uplinkInterfaces, setUplinkInterfaces] = useState([])

  const [ssid, setSsid] = useState('SPRNet')
  const [countryWifi, setCountryWifi] = useState('US')
  const [wifiInterfaces, setWifiInterfaces] = useState([])
  const [iwMap, setIwMap] = useState({})
  const [interfaceUplink, setInterfaceUplink] = useState('eth0')
  const [myIP, setMyIP] = useState('')
  const [tinynet, setTinynet] = useState('192.168.2.0/24')
  const [needIPReload, setNeedIPReload] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [isDone, setIsDone] = useState(false)
  const [checkUpdates, setCheckUpdates] = useState(true)
  const [randomizeBSSIDs, setRandomizeBSSIDs] = useState(true)
  const [cloakBSSIDs, setCloakBSSIDs] = useState(false)
  const [reportInstall, setReportInstall] = useState(true)

  const [setupStage, setSetupStage] = useState(0)
  const [alertType, setAlertType] = useState('')
  const [alertBody, setAlertBody] = useState('')

  const [addrs, setAddrs] = useState([])
  const [apiReachable, setApiReachable] = useState(false)
  const [ssidUp, setSsidUp] = useState(false)

  const [sslConnected, setSslConnected] = useState(
    Platform.OS == 'web' && window?.location?.protocol == 'https:'
  )

  const pollingRef = useRef(null)

  const setupAlert = (title, body) => {
    setAlertType(title)
    setAlertBody(body)
  }

  context.success = (title, body) => setupAlert('success', title, body)
  context.warning = (title, body) => setupAlert('warning', title, body)
  context.danger = (title, body) => setupAlert('danger', title, body)
  context.error = (title, body) => setupAlert('error', title, body)
  context.info = (title, body) => setupAlert('info', title, body)

  const pollApi = async () => {
    try {
      const addrs = await wifiAPI.ipAddr()
      setApiReachable(true)
      setErrors({})

      setAddrs(addrs)

      //check if ap is up
      if (setupStage == 1) {
        clearInterval(pollingRef?.current)
      } else if (setupStage == 2) {
        const ifaces = await wifiAPI.interfaces('AP') // should be one
        for (let iface of ifaces) {
          const status = await wifiAPI.status(iface)
          const _ssid = status['ssid[0]']
          if (_ssid == ssid) {
            setSsidUp(true)

            clearInterval(pollingRef?.current)
            break
          }
        }
      } else if (setupStage == 3) {
        //3 == call /setup_done once
        clearInterval(pollingRef?.current)
        removeSetupAP()
      }

      return
    } catch (err) {
      setApiReachable(false)
      setErrors({ ...errors, submit: 'API not reachable' })
    }
  }

  const pollApiReachable = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    const interval = setInterval(() => {
      pollApi()
    }, 2 * 1e3)

    pollingRef.current = interval

    return interval
  }

  //call polling for each stage, stop when reachable
  useEffect(() => {
    const interval = pollApiReachable()

    return () => {
      clearInterval(interval)
    }
  }, [setupStage])

  useEffect(() => {
    api
      .get('/setup')
      .then((res) => {})
      .catch(async (err) => {
        if (err.response) {
          let msg = await err.response.text() // setup already done
          setErrors({ ...errors, submit: msg })
          setIsDone(true)
        } else {
          //unknown error
        }
      })

    wifiAPI
      .ipAddr()
      .then((ipAddr) => {
        wifiAPI
          .iwList()
          .then((iws) => {
            wifiAPI.iwDev().then((iwDev) => {
              iws = iws.map((iw) => {
                iw.devices = iwDev[iw.wiphy]
                return iw
              })

              //make a phy to iws map and devname to iw map
              let iwMap = {}
              iws.forEach((iw) => {
                iwMap[iw.wiphy] = iw
                Object.keys(iw.devices).forEach((dev) => {
                  iwMap[dev] = iw
                  iwMap[iw.wiphy].dev = dev
                })
              })

              setIwMap(iwMap)

              let validPhys = []
              for (let iw of iws) {
                if (isSPRCompat(iw)) {
                  validPhys.push(iw.wiphy)
                }
              }

              if (validPhys.length == 0) {
                alert('No compatible wifi interfaces found')
              }

              let newWiFiInterfaces = []
              let keys = Object.keys(iwDev)
              for (let phyName of keys) {
                if (!validPhys.includes(phyName)) continue
                let dev = iwDev[phyName]
                //check for SPR compatibility
                newWiFiInterfaces.push(...Object.keys(dev))
              }
              newWiFiInterfaces.sort()
              setWifiInterfaces(newWiFiInterfaces)
              //now go thru

              let uplinkInterfaces = []
              for (let entry of ipAddr) {
                if (entry.link_type == 'ether') {
                  if (entry.ifname.startsWith('docker')) {
                    continue
                  }
                  if (entry.ifname.startsWith('veth')) {
                    continue
                  }
                  if (
                    entry.ifname.startsWith('sprloop') ||
                    entry.ifname.startsWith('wlan')
                  ) {
                    continue
                  }
                  if (entry.addr_info && entry.addr_info.length > 0) {
                    entry.IP = entry.addr_info[0].local
                    if (entry.IP.includes('.')) {
                      setMyIP(entry.IP)
                    }
                    if (entry.IP.startsWith('192')) {
                      let x = entry.IP.split('.').map(Number)
                      x[2] += 1
                      if (x[2] != '2') {
                        setTinynet('192.168.' + x[2] + '.0/24')
                        setNeedIPReload(true)
                      }
                    }
                  }
                  uplinkInterfaces.push(entry.ifname)
                }
              }

              setUplinkInterfaces(uplinkInterfaces)
              if (uplinkInterfaces.includes('eth2')) {
                setInterfaceUplink('eth2')
              }
            })
          })
          .catch((e) => {})
      })
      .catch((e) => {})
  }, [])

  useEffect(() => {
    if ('ssid' in errors && ssid.length) {
      setErrors({})
    }
  }, [ssid])

  useEffect(() => {
    if ('tinynet' in errors && tinynet.length) {
      setErrors({})
    }
  }, [tinynet])

  useEffect(() => {
    if ('login' in errors && password.length) {
      setErrors({})
    }
  }, [password])

  //send a restart wifi command to disable spr-setup
  const removeSetupAP = async (done) => {
    api
      .put('/setup_done')
      .finally(() => wifiAPI.restartSetupWifi().finally(done))
  }

  const handlePress = () => {
    if (
      !ssid.match(
        /^[^!#;+\]\/"\t][^+\]\/"\t]{0,30}[^ +\]\/"\t]$|^[^ !#;+\]\/"\t]$[ \t]+$/
      )
    ) {
      setErrors({ ...errors, ssid: 'SSID need to be at least 2 characters' })
      return
    }

    let nets = tinynet.split(' ')
    let tinynets = []
    for (let n of nets) {
      //validate subnets
      if (
        !n.match(
          /^((?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])(?:\/(?:[1-9]|[1-2]\d|3[0-2]))$/
        )
      ) {
        setErrors({ ...errors, tinynet: 'Not a valid ipv4 network' })
        return
      }

      let pieces = n.split('/')
      if (parseInt(pieces[1]) > 24) {
        setErrors({
          ...errors,
          tinynet:
            'unsupported subnet size, use a /24 or larger network, you used:' +
            pieces[1]
        })
        return
      }

      if (parseInt(pieces[1]) < 7) {
        setErrors({
          ...errors,
          tinynet:
            'unsupported subnet size, use a /8 or smaller network, you used:' +
            pieces[1]
        })
        return
      }

      tinynets.push(n)
    }

    if (password.length < 5) {
      setErrors({
        ...errors,
        login: 'Password needs to be at least 5 characters'
      })
      return
    }

    if (password != passwordConfirm) {
      setErrors({
        ...errors,
        login: 'Password confirmation mismatch'
      })
      return
    }

    const finishSetup = () => {
      const data = {
        InterfaceUplink: interfaceUplink,
        AdminPassword: password,
        TinyNets: tinynets,
        ReportInstall: reportInstall,
        CheckUpdates: checkUpdates
      }

      api
        .put('/setup', data)
        .then((res) => {
          saveLogin('admin', passwordConfirm)
          setIsDone(true)
          setSetupStage(2)
          if (needIPReload === true) {
            let newIP = tinynet
            if (tinynet.includes('/')) {
              newIP = tinynet.split('/')[0]
              let x = entry.IP.split('.').map(Number)
              newIP = x[0] + '.' + x[1] + '.' + x[2] + '.' + '1'
              window.location =
                window.location.protocol + '//' + newIP + '/auth/setup'
            }
          }
        })
        .catch(async (err) => {
          if (err.response) {
            let msg = await err.response.text()
            setErrors({ ...errors, submit: msg })
          } else {
          }
        })
    }

    if (wifiInterfaces.length == 0) {
      finishSetup()
    }
    for (let iface of wifiInterfaces) {
      if (iface.includes('.')) continue

      let defaultConfig =
        generateConfigForBand(iwMap, iface, 2) ||
        generateConfigForBand(iwMap, iface, 1) ||
        generateConfigForBand(iwMap, iface, 4)

      //max out the settings
      let bestConfig = getBestWifiConfig(iwMap, iface, defaultConfig)

      let data = {
        Ssid: ssid,
        Channel: bestConfig.channel, //tbd?
        Country_code: countryWifi,
        Vht_capab: bestConfig.vht_capab,
        Ht_capab: bestConfig.ht_capab,
        Hw_mode: bestConfig.hw_mode,
        Ieee80211ax: parseInt(bestConfig.ieee80211ax),
        He_su_beamformer: parseInt(bestConfig.he_su_beamformer),
        He_su_beamformee: parseInt(bestConfig.he_su_beamformee),
        He_mu_beamformer: parseInt(bestConfig.he_mu_beamformer)
      }

      wifiAPI
        .enableInterface(iface)
        .then(() => {
          wifiAPI
            .updateConfig(iface, data)
            .then((curConfig) => {
              if (randomizeBSSIDs) {
                let data = {
                  Name: iface,
                  Type: 'AP',
                  MACRandomize: randomizeBSSIDs,
                  MACCloak: cloakBSSIDs,
                  Enabled: true
                }
                api
                  .put('/link/config', data)
                  .then((res) => {
                    finishSetup()
                  })
                  .catch((e) => {
                    alert(
                      'error link/config ' + iface + ' ' + JSON.stringify(e)
                    )
                  })
              } else {
                finishSetup()
              }
            })
            .catch((e) => {
              alert('error update hostapd config ' + JSON.stringify(e))
            })
        })
        .catch((e) => {
          //...
          alert('error enable interface ' + JSON.stringify(e))
        })
    }
  }

  const handlePressFinish = () => {
    removeSetupAP(() => {
      navigate('/auth/login')
    })
  }

  const SetupHeading = ({ title, children, ...props }) => {
    return (
      <HStack
        justifyContent="space-between"
        borderBottomColor="$muted200"
        borderBottomWidth={1}
        pb="$4"
        {...props}
      >
        <Heading
          size="lg"
          fontWeight="300"
          color="$coolGray800"
          sx={{
            _dark: { color: '$warmGray50' }
          }}
          alignSelf="center"
        >
          {title}
        </Heading>
        {children}
      </HStack>
    )
  }

  const UplinkIP = ({ ip, ...props }) => {
    return ip ? (
      <Badge variant="outline" action="success" rounded="$md">
        <BadgeText>Uplink IP: {ip}</BadgeText>
      </Badge>
    ) : null
  }

  const SSIDInfo = ({ online, ...props }) => {
    return (
      <Badge
        variant="outline"
        action={online ? 'success' : 'muted'}
        rounded="$md"
      >
        {online ? <BadgeIcon as={WifiIcon} /> : <Spinner size="small" />}
        <BadgeText textTransform="none" ml="$2">
          {online ? ssid : `Waiting for ${ssid}...`}
        </BadgeText>
      </Badge>
    )
  }

  const Status = ({ addrs, online, ...props }) => {
    const ethsConnected = addrs.filter((a) =>
      a.ifname.startsWith('eth') && a.operstate == 'UP' ? a : null
    )

    const SuccessItem = ({ text, error, isOK, ...props }) => {
      const icon = isOK ? CheckCircleIcon : AlertCircleIcon
      const color = isOK ? '$success600' : '$warning600'
      return (
        <HStack space="sm" alignItems="center">
          <Icon as={icon} color={color} />
          <Text>{isOK ? text : error}</Text>
        </HStack>
      )
    }

    return (
      <VStack space="sm" alignItems="center">
        <Heading size="sm">Status</Heading>

        {online ? (
          <>
            <SuccessItem
              text="Network cable connected"
              error="No network cable connected"
              isOK={ethsConnected.length}
            />
            <SuccessItem
              text="Wifi card detected"
              error="Could not find any wifi card compatible with spr"
              isOK={wifiInterfaces.length}
            />

            <SuccessItem
              text="Connected over https"
              error="Not connected using https"
              isOK={sslConnected}
            />

            <HStack
              space="xs"
              display={apiReachable && !ethsConnected.length ? 'flex' : 'none'}
            >
              <Text size="sm" italic>
                Note:
              </Text>
              <Text size="sm">
                If you want to use wifi for internet access, this can be setup
                after the install under Network: Link Settings.
              </Text>
            </HStack>
          </>
        ) : (
          <HStack space="sm">
            <Spinner size="small" />
            <Text>API Loading...</Text>
          </HStack>
        )}
      </VStack>
    )
  }

  if (setupStage === 2) {
    //when cli connects, navigate to next stage
    const onDeviceConnect = () => {
      setTimeout(() => {
        setSetupStage(setupStage + 1)
      }, 1000)
    }

    //skip or click success button
    const deviceAdded = () => {
      setSetupStage(setupStage + 1)
    }

    return (
      <SetupScrollView>
        <SetupHeading title="Add Your First WiFi Device">
          <SSIDInfo online={ssidUp} ssid={ssid} />
        </SetupHeading>
        <VStack>
          <AddDevice
            deviceAddedCallback={deviceAdded}
            onClose={deviceAdded}
            onConnect={onDeviceConnect}
            disabled={!ssidUp}
          />

          <AlertError alertBody={alertBody} />
        </VStack>
      </SetupScrollView>
    )
  }

  if (setupStage === 3) {
    return (
      <SetupScrollView>
        <SetupHeading title="Setup Finished" />

        <VStack space="xl" my="$4">
          <HStack space="sm" alignItems="center">
            <CheckIcon color="$success500" />
            <Text>SPR is now configured!</Text>
          </HStack>

          <HStack space="sm" alignItems="center">
            <InfoIcon color="$muted500" />
            <Text>
              Note: The `ubuntu` password will be set to your admin password
            </Text>
          </HStack>

          <HStack space="sm" alignItems="center">
            <Icon as={BookOpenTextIcon} color="$muted500" />
            <Link
              isExternal
              href="https://www.supernetworks.org/pages/docs/guides_plus/mesh"
            >
              <Text>PLUS Mesh Setup Guide</Text>
            </Link>
          </HStack>

          <ButtonSetup onPress={handlePressFinish} disabled={!apiReachable}>
            {apiReachable ? (
              <ButtonText>Finish</ButtonText>
            ) : (
              <ButtonText>Waiting for API...</ButtonText>
            )}
          </ButtonSetup>
        </VStack>
      </SetupScrollView>
    )
  }

  // log out.
  AsyncStorage.removeItem('user')

  // this is when visiting setup when already configured
  if (isDone) {
    return (
      <SetupScrollView>
        <SetupHeading title="Setup" />
        <HStack space="sm" alignSelf="center" alignItems="center">
          <InfoIcon color="$muted400" />
          <Text flex={1} color="$muted500">
            SPR is configured!
          </Text>
        </HStack>

        <ButtonSetup onPress={() => navigate('/auth/login')}>
          <ButtonText>Click here to login</ButtonText>
        </ButtonSetup>
      </SetupScrollView>
    )
  }

  if (setupStage == 1) {
    return (
      <SetupScrollView>
        <SetupHeading title="Setup">
          <>
            {apiReachable ? (
              <UplinkIP ip={myIP} />
            ) : (
              <ApiLoading online={apiReachable} />
            )}
          </>
        </SetupHeading>

        <>
          {/*NOTE Safari will autofill as contact if using Name in label and/or placeholder*/}
          <FormControl isInvalid={'ssid' in errors}>
            <FormControlLabel>
              <FormControlLabelText>
                {'Wifi N\u0430me (SSID)'}
              </FormControlLabelText>
            </FormControlLabel>
            <Input size="md">
              <InputField
                autoFocus
                value={ssid}
                placeholder={'N\u0430me of your Wireless Network'}
                onChangeText={(value) => setSsid(value)}
              />
            </Input>
            {'ssid' in errors ? (
              <FormControlError>
                <FormControlErrorText>{errors.ssid}</FormControlErrorText>
              </FormControlError>
            ) : null}
          </FormControl>
          <FormControl isInvalid={'country' in errors}>
            <FormControlLabel>
              <FormControlLabelText>Wifi Country Code</FormControlLabelText>
            </FormControlLabel>

            <Select
              selectedValue={countryWifi}
              onValueChange={(value) => setCountryWifi(value)}
              accessibilityLabel={`Choose Country Code`}
            >
              {countryCodes.map((code) => (
                <Select.Item key={code} label={code} value={code} />
              ))}
            </Select>
          </FormControl>

          <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
            <Tooltip
              label={
                "The BSSID (AP MAC Address) and SSID is stored by companies in location tracking databases.\nRandomizing it makes the AP's physical location private."
              }
            >
              <Checkbox
                size="md"
                value={randomizeBSSIDs}
                isChecked={randomizeBSSIDs}
                onChange={(enabled) => setRandomizeBSSIDs(!randomizeBSSIDs)}
              >
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon as={CheckIcon} />
                </CheckboxIndicator>
                <CheckboxLabel>
                  Randomize BSSID for Location Privacy
                </CheckboxLabel>
              </Checkbox>
            </Tooltip>

            {randomizeBSSIDs && (
              <Checkbox
                size="md"
                value={cloakBSSIDs}
                isChecked={cloakBSSIDs}
                onChange={(enabled) => setCloakBSSIDs(!cloakBSSIDs)}
              >
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon as={CheckIcon} />
                </CheckboxIndicator>
                <CheckboxLabel>Randomize to Common AP Vendor</CheckboxLabel>
              </Checkbox>
            )}
          </VStack>

          <FormControl isInvalid={'uplink' in errors}>
            <FormControlLabel>
              <FormControlLabelText>
                Uplink Interface (Internet)
              </FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={interfaceUplink}
              onValueChange={(value) => setInterfaceUplink(value)}
            >
              {uplinkInterfaces.map((wif) => (
                <Select.Item key={wif} label={wif} value={wif} />
              ))}
            </Select>
          </FormControl>

          <FormControl isInvalid={'tinynet' in errors}>
            <FormControlLabel>
              <FormControlLabelText>
                Private Network Subnet
              </FormControlLabelText>
            </FormControlLabel>
            <Input>
              <InputField
                value={tinynet}
                placeholder={'Private subnet for network'}
                onChangeText={(value) => {
                  setTinynet(value)
                  setNeedIPReload(true)
                }}
              />
            </Input>
            {'tinynet' in errors ? (
              <FormControlError>
                <FormControlErrorText>{errors.tinynet}</FormControlErrorText>
              </FormControlError>
            ) : null}
          </FormControl>

          <FormControl isInvalid={'login' in errors}>
            <FormControlLabel>
              <FormControlLabelText>Admin Password</FormControlLabelText>
            </FormControlLabel>
            <Input variant="outline" size="md">
              <InputField
                type="password"
                value={password}
                placeholder="Password"
                onChangeText={(value) => setPassword(value)}
                onSubmitEditing={handlePress}
              />
              <InputSlot>
                <InputIcon as={KeyRoundIcon} mr="$2" />
              </InputSlot>
            </Input>
            <Input variant="outline" size="md" mt="$2">
              <InputField
                type="password"
                value={passwordConfirm}
                placeholder="Confirm Password"
                onChangeText={(value) => setPasswordConfirm(value)}
                onSubmitEditing={handlePress}
              />
              <InputSlot>
                <InputIcon as={KeyRoundIcon} mr="$2" />
              </InputSlot>
            </Input>

            {'login' in errors ? (
              <FormControlError>
                <FormControlErrorText>{errors.login}</FormControlErrorText>
              </FormControlError>
            ) : null}
          </FormControl>

          <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
            <Checkbox
              size="md"
              value={checkUpdates}
              isChecked={checkUpdates}
              onChange={(enabled) => setCheckUpdates(!checkUpdates)}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon as={CheckIcon} />
              </CheckboxIndicator>
              <CheckboxLabel>Auto-Check for Updates</CheckboxLabel>
            </Checkbox>

            <Tooltip
              label={'Help the Supernetworks Team count your installation'}
            >
              <Checkbox
                size="md"
                value={reportInstall}
                isChecked={reportInstall}
                onChange={(enabled) => setReportInstall(!reportInstall)}
              >
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon as={CheckIcon} />
                </CheckboxIndicator>
                <CheckboxLabel>Register Install</CheckboxLabel>
              </Checkbox>
            </Tooltip>
          </VStack>

          <ButtonSetup onPress={handlePress} disabled={!apiReachable} mt="$4">
            {apiReachable ? (
              <ButtonText>Save</ButtonText>
            ) : (
              <ButtonText>Waiting for API...</ButtonText>
            )}
          </ButtonSetup>

          {'submit' in errors ? (
            <HStack space="md" alignSelf="center" alignItems="center">
              <AlertCircle color="$red700" />
              <Text color="$red700">{errors.submit}</Text>
            </HStack>
          ) : null}

          {/*'api' in errors ? (
            <HStack space="md" alignSelf="center" alignItems="center">
              <AlertCircle color="$red700" />
              <Text color="$red700">{errors.api}</Text>
            </HStack>
          ) : null*/}
        </>
      </SetupScrollView>
    )
  }

  return (
    <SetupScrollView>
      <SetupHeading title="Welcome to SPR!" justifyContent="center" />
      <VStack space="xl" alignItems="center">
        <Status online={apiReachable} addrs={addrs} />
        <Text>Press Start to configure your new Wifi</Text>
        <HStack space="lg">
          <ButtonSetup onPress={() => setSetupStage(1)} px="$8">
            <ButtonText>Start</ButtonText>
          </ButtonSetup>
          <Link
            display={sslConnected ? 'none' : 'flex'}
            href={`https://${window?.location?.hostname}${window?.location?.pathname}`}
          >
            <ButtonSetup variant="outline" action="positive" bg="$none">
              <ButtonText>
                Visit https://{window?.location?.hostname}
              </ButtonText>
            </ButtonSetup>
          </Link>
        </HStack>
      </VStack>
    </SetupScrollView>
  )
}

export default Setup
