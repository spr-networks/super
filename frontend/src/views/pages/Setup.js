import React, { useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, wifiAPI, firewallAPI, saveLogin } from 'api'
import * as xapi from 'api';
import {generateCapabilitiesString, generateConfigForBand, getBestWifiConfig, isSPRCompat} from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import AddDevice from 'components/Devices/AddDevice'
import { countryCodes } from 'utils'
import { Tooltip } from 'components/Tooltip'
import FirewallSettings from 'views/Firewall/FirewallSettings'

import {
  Box,
  Button,
  ButtonIcon,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CheckIcon,
  Link,
  Heading,
  HStack,
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
  useColorMode
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

import { AlertContext } from 'AppContext'
import { AlertCircle, BookOpenText, KeyRoundIcon } from 'lucide-react-native'


const AlertError = (props) => {
  return (
    <>
    {props.alertBody && (
      <Text>{props.alertBody}</Text>
    )}
    </>
  )
}

const ApiLoading = (props) => {
  return (
    <>
    {props.online ? (
      <></>
    ) : (
      <HStack flex={1} space="sm" alignSelf="center" alignItems="center">
        <Tooltip label={'Reload the page or reconnect to the SPR Setup AP'}>
          <InfoIcon color="$muted400" />
        </Tooltip>
        <Text>API Loading...</Text>
        <Spinner size="small"/>
      </HStack>
    )
    }
    </>
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
  const [errors, setErrors] = React.useState({})
  const [isDone, setIsDone] = useState(false)
  const [checkUpdates, setCheckUpdates] = useState(true)
  const [randomizeBSSIDs, setRandomizeBSSIDs] = useState(true)
  const [cloakBSSIDs, setCloakBSSIDs] = useState(false)
  const [reportInstall, setReportInstall] = useState(true)

  const [setupStage, setSetupStage] = useState(1)
  const [alertType, setAlertType] = useState("")
  const [alertBody, setAlertBody] = useState("")

  const [apiReachable, setApiReachable] = useState(false)
  const pollingRef = useRef(null);

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
    if (pollingRef.current) return;
    pollingRef.current = true;

    while (true) {
      await wifiAPI.ipAddr().then(() => {
        //clear errors
        setErrors({})
        setApiReachable(true)
      }).catch((err) => {
        setApiReachable(false)
        setErrors({"submit": 'API not reachable ' + JSON.stringify(err) })
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  useEffect(() => {
    pollApiReachable()
  })


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
          //alert(err)
        }
      })


    wifiAPI.ipAddr().then((ipAddr) => {
      wifiAPI.iwList().then((iws) => {
        wifiAPI.iwDev().then((iwDev) => {

          iws = iws.map((iw) => {
            iw.devices = iwDev[iw.wiphy];
            return iw;
          });

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
            alert("No compatible wifi interfaces found")

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
              if (entry.ifname.startsWith('sprloop') || entry.ifname.startsWith("wlan")) {
                continue
              }
              if (entry.addr_info && entry.addr_info.length > 0) {
                entry.IP = entry.addr_info[0].local
                if (entry.IP.includes('.')) {
                  setMyIP(entry.IP)
                }
                if (entry.IP.startsWith("192")) {
                  let x = entry.IP.split('.').map(Number)
                  x[2] += 1
                  setTinynet('192.168.' + x[2] + '.0/24')
                }
              }
              uplinkInterfaces.push(entry.ifname)
            }
          }

          setUplinkInterfaces(uplinkInterfaces)
          if (uplinkInterfaces.includes("eth2")) {
            setInterfaceUplink("eth2")
          }
        })
      }).catch((e) => {})
    }).catch((e) => {})
  }, [])


  useEffect(() => {
    if ('login' in errors && password.length) {
      setErrors({})
    }
  }, [password])

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
        }).catch(async (err) => {
          if (err.response) {
            let msg = await err.response.text()
            setErrors({ ...errors, submit: msg })
          } else {
          }
        })
    }

    for (let iface of wifiInterfaces) {
      if (iface.includes(".")) continue;

      let defaultConfig = generateConfigForBand(iwMap, iface, 2) ||
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

      wifiAPI.enableInterface(iface).then(() => {
        wifiAPI.updateConfig(iface, data).then((curConfig) => {
          if (randomizeBSSIDs) {
            let data = {
              Name: iface,
              Type: "AP",
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
                alert("error link/config" + JSON.stringify(e))
              })
          } else {
            finishSetup()
          }

        })
        .catch((e) => {
          alert("error update hostapd config " + JSON.stringify(e))
        })
      }).catch((e) => {
        //...
        alert("error enable interface " + JSON.stringify(e))
      })
    }


  }

  const removeSetupAP = (done) => {
    api.put("/setup_done")
    .then( () => {
          wifiAPI.restartSetupWifi().then(() => {
            done()
          }).catch(err => {
            done()
          })
    })
    .catch( (err) => {

      wifiAPI.restartSetupWifi().then(() => {
        done()
      }).catch(err => {
        done()
      })

    })

  }


  const handlePressFinish = () => {
      //send a restart wifi command to disable sprlab-setup
      removeSetupAP(() => {
        navigate("/auth/login")
      })
  }

  const deviceAdded = () => {
    setSetupStage(3)
  }

  const colorMode = useColorMode()

  if (setupStage === 2) {
    return (
      <ScrollView
        h="$full"
        w="$full"
        px="$4"
        bg="$white"
        sx={{
          _dark: { bg: '$blueGray900' },
          '@md': {
            rounded: 10,
            w: '60%',
            alignSelf: 'center'
          }
        }}
      >
      <VStack space="md" my="$4">
          <Heading
            size="lg"
            fontWeight="300"
            color="$coolGray800"
            sx={{
              _dark: { color: '$warmGray50' }
            }}
            alignSelf="center"
          >
            Add Your First WiFi Device
          </Heading>
          <ApiLoading
            online={apiReachable}/>
          {myIP != '' && (
            <HStack space="sm" alignSelf="center" alignItems="center">
              <Text flex={1} color="$muted500">
                Uplink IP: {myIP}
              </Text>
            </HStack>
          )}

        <AddDevice slimView={true} deviceAddedCallback={deviceAdded} />

        <Button
          mt="$4"
          action="secondary"
          sx={{
            _hover: {
              bg: '#fab526'
            },
            w: '$5/6'
          }}
          onPress={deviceAdded}
          disabled={!apiReachable}
        >
          <ButtonText>Skip</ButtonText>
        </Button>

        <AlertError alertBody={alertBody} />
      </VStack>
      </ScrollView>
    )
  }


  if (setupStage === 3) {
    return (
      <ScrollView
        h="$full"
        w="$full"
        px="$4"
        bg="$white"
        sx={{
          _dark: { bg: '$blueGray900' },
          '@md': {
            rounded: 10,
            w: '90%',
            maxWidth: 520,
            alignSelf: 'center'
          }
        }}
      >
      <VStack space="md" my="$4">
          <Heading
            size="lg"
            fontWeight="300"
            color="$coolGray800"
            sx={{
              _dark: { color: '$warmGray50' }
            }}
            alignSelf="center"
          >
            Setup Finished
          </Heading>
          <ApiLoading
            online={apiReachable}/>
          {myIP != '' && (
            <HStack space="sm" alignSelf="center" alignItems="center">
              <Text flex={1} color="$muted500">
                Uplink IP: {myIP}
              </Text>
            </HStack>
          )}
          <VStack space="md" my="$4" flex={1}>
            <HStack space="sm">
              <InfoIcon color="$muted400" />
              <Text flex={1} color="$muted500">
                SPR is now configured!
              </Text>
            </HStack>

            <HStack space="sm">
              <InfoIcon color="$muted400" />
              <Text flex={1} color="$muted500">
                Note: The `ubuntu` password will be set to your admin password during the initial installation.
              </Text>
            </HStack>

            <HStack space="sm">
              <InfoIcon color="$muted400" />
              <Link
                isExternal
                href="https://www.supernetworks.org/pages/docs/guides_plus/mesh"
                sx={{
                  '@base': { display: 'none' },
                  '@lg': { display: 'flex' },
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
                <ButtonIcon as={BookOpenText} size="lg" />
              </Link>
            </HStack>

            <FirewallSettings/>

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
            { apiReachable ? (
              <ButtonText>Finish</ButtonText>
            ) : (
              <ButtonText>Waiting for API</ButtonText>
            )}
          </Button>
        </VStack>
        <AlertError alertBody={alertBody} />
        </VStack>
      </ScrollView>
    )
  }


  // log out.
  AsyncStorage.removeItem('user')


  return (
    <ScrollView
      h="$full"
      w="$full"
      px="$4"
      bg="$white"
      sx={{
        _dark: { bg: '$blueGray900' },
        '@md': {
          rounded: 10,
          w: '90%',
          maxWidth: 360,
          alignSelf: 'center'
        }
      }}
    >
      <VStack space="md" my="$4">
        <Heading
          size="lg"
          fontWeight="300"
          color="$coolGray800"
          sx={{
            _dark: { color: '$warmGray50' }
          }}
          alignSelf="center"
        >
          Setup
        </Heading>
        <ApiLoading
          online={apiReachable}/>
        {myIP != '' && (
          <HStack space="sm" alignSelf="center" alignItems="center">
            <Text flex={1} color="$muted500">
              Uplink IP: {myIP}
            </Text>
          </HStack>
        )}
        {isDone ? (
          <>
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
          </>
        ) : (
          <>
            {/*NOTE Safari will autofill as contact if using Name in label and/or placeholder*/}
            <FormControl isInvalid={'ssid' in errors}>
              <FormControlLabel>
                <FormControlLabelText>
                  {'Wifi N\u0430me (SSID)'}
                </FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  value={ssid}
                  placeholder={'N\u0430me of your Wireless Network'}
                  onChangeText={(value) => setSsid(value)}
                  autoFocus
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

            <Tooltip label={'The BSSID (AP MAC Address) and SSID is stored by companies in location tracking databases. Randomizing it makes the AP\'s physical location private.'}>
              <Checkbox
                size="md"
                value={randomizeBSSIDs}
                isChecked={randomizeBSSIDs}
                onChange={(enabled) => setRandomizeBSSIDs(!randomizeBSSIDs)}

              >
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon as={CheckIcon} />
                </CheckboxIndicator>
                <CheckboxLabel>Randomize BSSID for Location Privacy</CheckboxLabel>
              </Checkbox>
            </Tooltip>

            { randomizeBSSIDs && (
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
                  autoFocus
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
              <Input variant="outline" size="md">
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


            <Tooltip label={'Help the Supernetworks Team count your installation by counting the install'}>
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
        )}
      </VStack>
    </ScrollView>
  )
}

export default Setup
