import React, { useContext, useEffect, useRef, useState } from 'react'
import { api, wifiAPI } from 'api'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCircleExclamation,
  faEthernet,
  faInfoCircle,
  faKey,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import Icon from 'FontAwesomeUtils'

import {
  Box,
  Button,
  Center,
  Text,
  View,
  Link,
  Heading,
  HStack,
  VStack,
  FormControl,
  Input,
  Select,
  useColorModeValue
} from 'native-base'
import { AlertContext } from 'AppContext'

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
        px={4}
        py={8}
        w="90%"
        maxW={360}
        bg={useColorModeValue('white', 'blueGray.900')}
        rounded={10}
        shadow={2}
      >
        <Heading
          size="lg"
          fontWeight="300"
          color="coolGray.800"
          _dark={{
            color: 'warmGray.50'
          }}
          alignSelf="center"
        >
          Setup
        </Heading>
        <VStack space={4} mt={12}>
          {isDone ? (
            <>
              <HStack alignSelf="center" alignItems="center" space={2}>
                <Icon icon={faInfoCircle} color="muted.500" />
                <Text alignSelf="center" color="muted.500">
                  SPR is configured!
                </Text>
              </HStack>

              <Button
                mt={8}
                alignSelf="center"
                rounded="full"
                colorScheme="yellow"
                bg="#fbc658"
                _hover={{
                  bg: '#fab526'
                }}
                px={8}
                href="/auth/login"
              >
                Click here to login
              </Button>
            </>
          ) : (
            <>
              {/*NOTE Safari will autofill as contact if using Name in label and/or placeholder*/}
              <FormControl isInvalid={'ssid' in errors}>
                <FormControl.Label>{'Wifi N\u0430me (SSID)'}</FormControl.Label>
                <Input
                  value={ssid}
                  placeholder={'N\u0430me of your Wireless Network'}
                  onChangeText={(value) => setSsid(value)}
                  autoFocus
                />
                {'ssid' in errors ? (
                  <FormControl.ErrorMessage
                    _text={{
                      fontSize: 'xs'
                    }}
                  >
                    {errors.ssid}
                  </FormControl.ErrorMessage>
                ) : null}
              </FormControl>
              <FormControl isInvalid={'country' in errors}>
                <FormControl.Label>Wifi Country Code</FormControl.Label>

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
                <FormControl.Label>Wifi Interface</FormControl.Label>
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
                <FormControl.Label>
                  Uplink Interface (Internet)
                </FormControl.Label>
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
                <FormControl.Label>Private Network Subnet(s)</FormControl.Label>
                <Input
                  value={tinynet}
                  placeholder={'Private subnet for network'}
                  onChangeText={(value) => setTinynet(value)}
                  autoFocus
                />
                {'tinynet' in errors ? (
                  <FormControl.ErrorMessage
                    _text={{
                      fontSize: 'xs'
                    }}
                  >
                    {errors.tinynet}
                  </FormControl.ErrorMessage>
                ) : null}
              </FormControl>

              <FormControl isInvalid={'login' in errors}>
                <FormControl.Label>Admin Password</FormControl.Label>
                <Input
                  type="password"
                  value={password}
                  variant="outline"
                  size="md"
                  InputLeftElement={
                    <Icon icon={faKey} size={4} ml={2} color="muted.400" />
                  }
                  placeholder="Password"
                  onChangeText={(value) => setPassword(value)}
                  onSubmitEditing={handlePress}
                />
                {'login' in errors ? (
                  <FormControl.ErrorMessage
                    _text={{
                      fontSize: 'xs'
                    }}
                  >
                    {errors.login}
                  </FormControl.ErrorMessage>
                ) : null}
              </FormControl>

              <Button
                mt={8}
                rounded="full"
                colorScheme="yellow"
                bg="#fbc658"
                _hover={{
                  bg: '#fab526'
                }}
                onPress={handlePress}
              >
                Save
              </Button>
              {'submit' in errors ? (
                <HStack space={2} alignSelf="center" alignItems="center">
                  <Icon icon={faCircleExclamation} color="error.700" />
                  <Text color="error.700">{errors.submit}</Text>
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
