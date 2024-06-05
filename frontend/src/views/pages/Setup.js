import React, { useContext, useEffect, useRef, useState } from 'react'
import { api, wifiAPI } from 'api'
import {generateCapabilitiesString, generateConfigForBand, getBestWifiConfig, isSPRCompat} from 'api/Wifi'
import { useNavigate } from 'react-router-dom'
import AddDevice from 'components/Devices/AddDevice'
import { countryCodes } from 'utils'

import {
  Box,
  Button,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CheckIcon,
  Text,
  View,
  Heading,
  HStack,
  VStack,
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
  useColorMode
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

import { AlertContext } from 'AppContext'
import { AlertCircle, KeyRoundIcon } from 'lucide-react-native'


const AlertError = (props) => {
  return (
    <>
    {props.alertBody && (
      <Text>{props.alertBody}</Text>
    )}
    </>
  )
}

const Setup = (props) => {
  const context = useContext(AlertContext)

  const navigate = useNavigate()
  const [uplinkInterfaces, setUplinkInterfaces] = useState([])

  const [ssid, setSsid] = useState('SPRLab')
  const [countryWifi, setCountryWifi] = useState('US')
  const [wifiInterfaces, setWifiInterfaces] = useState([])
  const [iwMap, setIwMap] = useState({})
  const [interfaceUplink, setInterfaceUplink] = useState('eth0')
  const [tinynet, setTinynet] = useState('192.168.2.0/24')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = React.useState({})
  const [isDone, setIsDone] = useState(false)
  const [checkUpdates, setCheckUpdates] = useState(true)
  const [randomizeBSSIDs, setRandomizeBSSIDs] = useState(false)
  const [cloakBSSIDs, setCloakBSSIDs] = useState(false)
  const [reportInstall, setReportInstall] = useState(false)

  const [setupStage, setSetupStage] = useState(1)
  const [alertType, setAlertType] = useState("")
  const [alertBody, setAlertBody] = useState("")

  const setupAlert = (title, body) => {
    setAlertType(title)
    setAlertBody(body)
  }

  context.success = (title, body) => setupAlert('success', title, body)
  context.warning = (title, body) => setupAlert('warning', title, body)
  context.danger = (title, body) => setupAlert('danger', title, body)
  context.error = (title, body) => setupAlert('error', title, body)
  context.info = (title, body) => setupAlert('info', title, body)


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
          wifiAPI.restartWifi().then().catch(e => {
            alert(e)
          })
          setSetupStage(2)
        })
        .catch(async (err) => {
          if (err.response) {
            let msg = await err.response.text()
            setErrors({ ...errors, submit: msg })
          } else {
            alert(err)
          }
        })
    }

    for (let iface of wifiInterfaces) {
      let defaultConfig = generateConfigForBand(iwMap, iface, 2) ||
        generateConfigForBand(iwMap, iface, 1) ||
        generateConfigForBand(iwMap, iface, 4)

      //max out the settings
      let bestConfig = getBestWifiConfig(iwMap, iface, defaultConfig)

      let data = {
        Ssid: ssid,
//        Channel: defaultConfig.channel, //tbd?
        Country_code: countryWifi,
        Vht_capab: defaultConfig.vht_capab,
        Ht_capab: defaultConfig.ht_capab,
        Hw_mode: defaultConfig.hw_mode,
        Ieee80211ax: parseInt(defaultConfig.ieee80211ax),
        He_su_beamformer: parseInt(defaultConfig.he_su_beamformer),
        He_su_beamformee: parseInt(defaultConfig.he_su_beamformee),
        He_mu_beamformer: parseInt(defaultConfig.he_mu_beamformer)
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

  const handlePressFinish = () => {

    api
      .put('/setup_done')
      .then((res) => {
        setIsDone(true)
        navigate('/auth/login')
      })
      .catch(async (err) => {
        //let msg = await err.response.text()
        //setErrors({ ...errors, submit: msg })
        //navigate('/auth/login')
      })

  }

  const deviceAdded = () => {
    setSetupStage(3)
    //send a restart wifi command to disable sprlab-setup
    wifiAPI.restartWifi().then()
  }

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
          <HStack space="sm" alignSelf="center" alignItems="center">
            <InfoIcon color="$muted400" />

            <Text flex={1} color="$muted500">
              Thanks for installing. SPR is now configured! Note: SSH is enabled. Log in and change the password.
            </Text>
          </HStack>
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
        >
          <ButtonText>Finish</ButtonText>
        </Button>
        <AlertError alertBody={alertBody} />
        </VStack>
      </ScrollView>
    )
  }



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

            <Checkbox
              size="md"
              value={reportInstall}
              isChecked={reportInstall}
              onChange={(enabled) => setReportInstall(!reportInstall)}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon as={CheckIcon} />
              </CheckboxIndicator>
              <CheckboxLabel>Report Install Once</CheckboxLabel>
            </Checkbox>

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
            >
              <ButtonText>Save</ButtonText>
            </Button>

            {'submit' in errors ? (
              <HStack space="md" alignSelf="center" alignItems="center">
                <AlertCircle color="$red700" />
                <Text color="$red700">{errors.submit}</Text>
              </HStack>
            ) : null}
          </>
        )}
      </VStack>
    </ScrollView>
  )
}

export default Setup
