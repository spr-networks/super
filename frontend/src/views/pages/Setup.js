import React, { useContext, useEffect, useRef, useState } from 'react'
import { api, wifiAPI } from 'api'
import { useNavigate } from 'react-router-dom'

import {
  Box,
  Button,
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
  FormControlErrorText,
  InfoIcon
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

import { AlertContext } from 'AppContext'
import { AlertCircle, KeyRoundIcon } from 'lucide-react-native'

const Setup = (props) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()
  //TBD, not currently used for anything. in the future roll in channel selection
  const [config, setConfig] = useState({})
  const [wifiInterfaces, setWifiInterfaces] = useState([])
  const [uplinkInterfaces, setUplinkInterfaces] = useState([])

  const [ssid, setSsid] = useState('SPRLab')
  const [countryWifi, setCountryWifi] = useState('US')
  const [interfaceWifi, setInterfaceWifi] = useState('wlan1')
  const [interfaceUplink, setInterfaceUplink] = useState('eth0')
  const [tinynet, setTinynet] = useState('192.168.2.0/24')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = React.useState({})
  const [isDone, setIsDone] = useState(false)

  const countryCodes = [
    'AD',
    'AE',
    'AF',
    'AG',
    'AI',
    'AL',
    'AM',
    'AO',
    'AQ',
    'AR',
    'AS',
    'AT',
    'AU',
    'AW',
    'AX',
    'AZ',
    'BA',
    'BB',
    'BD',
    'BE',
    'BF',
    'BG',
    'BH',
    'BI',
    'BJ',
    'BL',
    'BM',
    'BN',
    'BO',
    'BQ',
    'BR',
    'BS',
    'BT',
    'BV',
    'BW',
    'BY',
    'BZ',
    'CA',
    'CC',
    'CD',
    'CF',
    'CG',
    'CH',
    'CI',
    'CK',
    'CL',
    'CM',
    'CN',
    'CO',
    'CR',
    'CU',
    'CV',
    'CW',
    'CX',
    'CY',
    'CZ',
    'DE',
    'DJ',
    'DK',
    'DM',
    'DO',
    'DZ',
    'EC',
    'EE',
    'EG',
    'EH',
    'ER',
    'ES',
    'ET',
    'FI',
    'FJ',
    'FK',
    'FM',
    'FO',
    'FR',
    'GA',
    'GB',
    'GD',
    'GE',
    'GF',
    'GG',
    'GH',
    'GI',
    'GL',
    'GM',
    'GN',
    'GP',
    'GQ',
    'GR',
    'GS',
    'GT',
    'GU',
    'GW',
    'GY',
    'HK',
    'HM',
    'HN',
    'HR',
    'HT',
    'HU',
    'ID',
    'IE',
    'IL',
    'IM',
    'IN',
    'IO',
    'IQ',
    'IR',
    'IS',
    'IT',
    'JE',
    'JM',
    'JO',
    'JP',
    'KE',
    'KG',
    'KH',
    'KI',
    'KM',
    'KN',
    'KP',
    'KR',
    'KW',
    'KY',
    'KZ',
    'LA',
    'LB',
    'LC',
    'LI',
    'LK',
    'LR',
    'LS',
    'LT',
    'LU',
    'LV',
    'LY',
    'MA',
    'MC',
    'MD',
    'ME',
    'MF',
    'MG',
    'MH',
    'MK',
    'ML',
    'MM',
    'MN',
    'MO',
    'MP',
    'MQ',
    'MR',
    'MS',
    'MT',
    'MU',
    'MV',
    'MW',
    'MX',
    'MY',
    'MZ',
    'NA',
    'NC',
    'NE',
    'NF',
    'NG',
    'NI',
    'NL',
    'NO',
    'NP',
    'NR',
    'NU',
    'NZ',
    'OM',
    'PA',
    'PE',
    'PF',
    'PG',
    'PH',
    'PK',
    'PL',
    'PM',
    'PN',
    'PR',
    'PS',
    'PT',
    'PW',
    'PY',
    'QA',
    'RE',
    'RO',
    'RS',
    'RU',
    'RW',
    'SA',
    'SB',
    'SC',
    'SD',
    'SE',
    'SG',
    'SH',
    'SI',
    'SJ',
    'SK',
    'SL',
    'SM',
    'SN',
    'SO',
    'SR',
    'SS',
    'ST',
    'SV',
    'SX',
    'SY',
    'SZ',
    'TC',
    'TD',
    'TF',
    'TG',
    'TH',
    'TJ',
    'TK',
    'TL',
    'TM',
    'TN',
    'TO',
    'TR',
    'TT',
    'TV',
    'TW',
    'TZ',
    'UA',
    'UG',
    'UM',
    'US',
    'UY',
    'UZ',
    'VA',
    'VC',
    'VE',
    'VG',
    'VI',
    'VN',
    'VU',
    'WF',
    'WS',
    'YE',
    'YT',
    'ZA',
    'ZM',
    'ZW'
  ]

  useEffect(() => {
    api
      .get('/setup')
      .then((res) => {})
      .catch(async (err) => {
        let msg = await err.response.text() // setup already done
        setIsDone(true)
      })

    wifiAPI.config(interfaceWifi).then(
      (conf) => {
        setConfig(conf)
      },
      [interfaceWifi]
    )

    wifiAPI.ipAddr().then((ipAddr) => {
      wifiAPI.iwDev().then((iwDev) => {
        let wifiInterfaces = []
        for (let dev of Object.values(iwDev)) {
          wifiInterfaces.push(...Object.keys(dev))
        }
        wifiInterfaces.sort()
        setWifiInterfaces(wifiInterfaces)

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
      })
    })
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

    const data = {
      InterfaceUplink: interfaceUplink,
      SSID: ssid,
      CountryCode: countryWifi,
      InterfaceAP: interfaceWifi,
      AdminPassword: password,
      TinyNets: tinynets
    }

    api
      .put('/setup', data)
      .then((res) => {
        //res.status==='done'
        setIsDone(true)
      })
      .catch(async (err) => {
        let msg = await err.response.text()
        setErrors({ ...errors, submit: msg })
        //setIsDone(true)
      })
  }

  return (
    <View w="100%" alignItems="center">
      <Box
        px="$4"
        py="$8"
        w="90%"
        maxWidth={360}
        bg="$white"
        sx={{
          _dark: { bg: '$blueGray900' }
        }}
        rounded={10}
        shadow={2}
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
          Setup
        </Heading>
        <VStack space="md" mt="$12">
          {isDone ? (
            <>
              <VStack alignItems="center" space="md">
                <InfoIcon color="$muted400" />

                <Text flex={1} color="$muted500">
                  SPR is configured!
                </Text>
              </VStack>

              <Button
                mt="$8"
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

              <FormControl isInvalid={'wifi' in errors}>
                <FormControlLabel>
                  <FormControlLabelText>Wifi Interface</FormControlLabelText>
                </FormControlLabel>
                <Select
                  selectedValue={interfaceWifi}
                  onValueChange={(value) => setInterfaceWifi(value)}
                >
                  {wifiInterfaces.map((wif) => (
                    <Select.Item key={wif} label={wif} value={wif} />
                  ))}
                </Select>
              </FormControl>

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
                    <FormControlErrorText>
                      {errors.tinynet}
                    </FormControlErrorText>
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
                  <FormControlErrorMessage
                    _text={{
                      size: 'xs'
                    }}
                  >
                    {errors.login}
                  </FormControlErrorMessage>
                ) : null}
              </FormControl>

              <Button
                mt="$8"
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
      </Box>
    </View>
  )
}

export default Setup
