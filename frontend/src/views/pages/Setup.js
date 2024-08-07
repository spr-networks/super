import React, { useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, wifiAPI, firewallAPI, saveLogin } from 'api'
import {
  generateCapabilitiesString,
  generateConfigForBand,
  getBestWifiConfig,
  isSPRCompat
} from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import AddDevice from 'components/Devices/AddDevice'
import { countryCodes } from 'utils'
import { Tooltip } from 'components/Tooltip'
import FirewallSettings from 'views/Firewall/FirewallSettings'

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
  BadgeText
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

import { AlertContext } from 'AppContext'
import {
  AlertCircle,
  BookOpenTextIcon,
  KeyRoundIcon
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
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [isDone, setIsDone] = useState(false)
  const [checkUpdates, setCheckUpdates] = useState(true)
  const [randomizeBSSIDs, setRandomizeBSSIDs] = useState(true)
  const [cloakBSSIDs, setCloakBSSIDs] = useState(false)
  const [reportInstall, setReportInstall] = useState(true)

  const [setupStage, setSetupStage] = useState(1)
  const [alertType, setAlertType] = useState('')
  const [alertBody, setAlertBody] = useState('')

  const [apiReachable, setApiReachable] = useState(false)
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

  const pollApiReachable = async () => {
    if (pollingRef.current) return
    pollingRef.current = true

    while (true) {
      try {
        await wifiAPI.ipAddr()
        setApiReachable(true)
        setErrors({})

        break //TODO setInterval
      } catch (err) {
        setApiReachable(false)
        setErrors({ ...errors, submit: 'API not reachable' })
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  useEffect(() => {
    pollApiReachable()
  }, [])

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
                      setTinynet('192.168.' + x[2] + '.0/24')
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
        })
        .catch(async (err) => {
          if (err.response) {
            let msg = await err.response.text()
            setErrors({ ...errors, submit: msg })
          } else {
          }
        })
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
                    alert('error link/config' + JSON.stringify(e))
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

  const removeSetupAP = (done) => {
    api
      .put('/setup_done')
      .then(() => {
        wifiAPI
          .restartSetupWifi()
          .then(() => {
            done()
          })
          .catch((err) => {
            done()
          })
      })
      .catch((err) => {
        wifiAPI
          .restartSetupWifi()
          .then(() => {
            done()
          })
          .catch((err) => {
            done()
          })
      })
  }

  const handlePressFinish = () => {
    //send a restart wifi command to disable sprlab-setup
    removeSetupAP(() => {
      navigate('/auth/login')
    })
  }

  const deviceAdded = () => {
    setSetupStage(3)
  }

  const colorMode = useColorMode()

  const SetupHeading = ({ title, isDone, children, ...props }) => {
    const heading = (
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
    )

    if (isDone) {
      return heading
    }

    return (
      <HStack justifyContent="space-between">
        {heading}

        {(!isDone || setupStage > 1) && (
          <>
            {apiReachable ? (
              <UplinkIP ip={myIP} />
            ) : (
              <ApiLoading online={apiReachable} />
            )}
          </>
        )}
        {children}
      </HStack>
    )
  }

  const UplinkIP = ({ ip, ...props }) => {
    if (!ip) {
      return <></>
    }

    return (
      <Badge variant="outline" action="success" rounded="$md">
        <BadgeText>Uplink IP: {ip}</BadgeText>
      </Badge>
    )

    /*return (
      <HStack space="sm" alignSelf="center" alignItems="center">
        <Text flex={1} color="$muted500">
          Uplink IP: {ip}
        </Text>
      </HStack>
    )*/
  }

  if (setupStage === 2) {
    return (
      <SetupScrollView>
        <SetupHeading title="Add Your First WiFi Device" />
        <VStack alignItems="center">
          <AddDevice slimView={true} deviceAddedCallback={deviceAdded} />

          <HStack
            space="md"
            px="$4"
            pb="$4"
            sx={{
              '@lg': { width: '$5/6' }
            }}
          >
            <Button
              action="secondary"
              variant="outline"
              w="$full"
              sx={{
                _hover: {
                  bg: '#fab526'
                }
              }}
              onPress={deviceAdded}
              disabled={!apiReachable}
            >
              <ButtonText>
                {apiReachable ? 'Skip' : 'API not reachable'}
              </ButtonText>
            </Button>
          </HStack>

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
            <CheckIcon color="success500" />
            <Text flex={1} color="$muted500">
              SPR is now configured!
            </Text>
          </HStack>

          <HStack space="sm" alignItems="center">
            <InfoIcon color="$muted500" />
            <Text flex={1} color="$muted500">
              Note: The `ubuntu` password will be set to your admin password
              during the initial installation
            </Text>
          </HStack>

          <HStack space="sm" alignItems="center">
            <Icon as={BookOpenTextIcon} color="$muted500" />
            <Link
              isExternal
              href="https://www.supernetworks.org/pages/docs/guides_plus/mesh"
              sx={{
                _text: {
                  textDecorationLine: 'none',
                  color:
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                }
              }}
            >
              <Text flex={1} color="$muted500">
                PLUS Mesh Setup Guide
              </Text>
            </Link>
          </HStack>

          {/*<FirewallSettings />*/}

          <Button
            mt="$4"
            rounded="$full"
            bg="#fbc658"
            sx={{
              _hover: {
                bg: '#fab526'
              }
            }}
            onPress={handlePressFinish}
            disabled={!apiReachable}
          >
            {apiReachable ? (
              <ButtonText>Finish</ButtonText>
            ) : (
              <ButtonText>Waiting for API</ButtonText>
            )}
          </Button>
        </VStack>
        <AlertError alertBody={alertBody} />
      </SetupScrollView>
    )
  }

  // log out.
  AsyncStorage.removeItem('user')

  // this is when visiting setup when already configured
  if (isDone) {
    return (
      <SetupScrollView>
        <SetupHeading title="Setup" isDone={isDone} />
        <HStack space="sm" alignSelf="center" alignItems="center">
          <InfoIcon color="$muted400" />
          <Text flex={1} color="$muted500">
            SPR is configured!
          </Text>
        </HStack>

        <Button
          mt="$2"
          mx="$auto"
          rounded="$full"
          colorScheme="yellow"
          bg="#fbc658"
          sx={{
            _hover: {
              bg: '#fab526'
            }
          }}
          px="$8"
          onPress={() => navigate('/auth/login')}
        >
          <ButtonText>Click here to login</ButtonText>
        </Button>
      </SetupScrollView>
    )
  }

  return (
    <SetupScrollView>
      <SetupHeading title="Setup" />

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
              Private Network Subnet(s)
            </FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField
              value={tinynet}
              placeholder={'Private subnet for network'}
              onChangeText={(value) => setTinynet(value)}
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

        <Button
          mt="$4"
          rounded="$full"
          bg="#fbc658"
          sx={{
            _hover: {
              bg: '#fab526'
            }
          }}
          onPress={handlePress}
          disabled={!apiReachable}
        >
          {apiReachable ? (
            <ButtonText>Save</ButtonText>
          ) : (
            <ButtonText>...waiting for API</ButtonText>
          )}
        </Button>

        {'submit' in errors ? (
          <HStack space="md" alignSelf="center" alignItems="center">
            <AlertCircle color="$red700" />
            <Text color="$red700">{errors.submit}</Text>
          </HStack>
        ) : null}

        {'api' in errors ? (
          <HStack space="md" alignSelf="center" alignItems="center">
            <AlertCircle color="$red700" />
            <Text color="$red700">{errors.api}</Text>
          </HStack>
        ) : null}
      </>
    </SetupScrollView>
  )
}

export default Setup
