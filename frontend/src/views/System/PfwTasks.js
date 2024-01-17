import React, { useContext, useEffect, useState } from 'react'
import { AlertContext } from 'layouts/Admin'
import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxLabel,
  CheckboxIndicator,
  ClockIcon,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  HStack,
  Input,
  InputField,
  Text,
  VStack,
  Heading
} from '@gluestack-ui/themed'
import { wifiAPI, pfwAPI } from 'api'
import { Select } from 'components/Select'
import { ListHeader } from 'components/List'

const PFWTasks = (props) => {
  const [taskConfig, setTaskConfig] = useState({})
  const [wifiScanEnabled, setWifiScanEnabled] = useState(false)
  const [uplinkCheckEnabled, setUplinkCheckEnabled] = useState(false)

  const [scanExpr, setScanExpr] = useState('10 Minutes')
  const [uplinkExpr, setUplinkExpr] = useState('10 Minutes')

  const [scanIface, setScanIface] = useState('N/A')
  const [devSelect, setDevSelect] = useState([{ value: '', label: 'N/A' }])

  const [uplinkCheckType, setUplinkCheckType] = useState('')
  const [uplinkCheckAddress, setUplinkCheckAddress] = useState('')
  const [uplinkCheckPort, setUplinkCheckPort] = useState('')

  const context = useContext(AlertContext)

  useEffect(() => {
    getConfig()
    getIW()
  }, [])

  const getConfig = () => {
    pfwAPI
      .getTaskConfig()
      .then((config) => {
        if (config?.WiFiScan?.Interfaces?.length > 0) {
          setScanIface(config.WiFiScan.Interfaces[0])
        }

        if (config?.UplinkCheck?.Addresses?.length > 0) {
          let addr = config.UplinkCheck.Addresses[0]
          let pieces = addr.split(':')
          if (pieces.length > 0) {
            setUplinkCheckType(pieces[0])
          }
          if (pieces.length > 1) {
            setUplinkCheckAddress(pieces[1])
          }
          if (pieces.length > 2) {
            setUplinkCheckPort(pieces[2])
          }
        }

        setWifiScanEnabled(!config?.WiFiScan?.Disabled)
        setUplinkCheckEnabled(!config?.WiFiScan?.Disabled)

        //back-set the time expressions
        let cron = config?.WiFiScan?.Time?.CronExpr
        if (cron) {
          for (let entry in timeMap) {
            if (timeMap[entry] == cron) {
              setScanExpr(entry)
            }
          }
        }

        cron = config?.UplinkCheck?.Time?.CronExpr
        if (cron) {
          for (let entry in timeMap) {
            if (timeMap[entry] == cron) {
              setUplinkExpr(entry)
            }
          }
        }

        setTaskConfig(config)
      })
      .catch((e) => {
        context.error('failed to get status')
      })
  }

  const getIW = () => {
    wifiAPI.iwDev().then((devs) => {
      let devS = [{ value: '', label: 'N/A' }]
      for (let phy in devs) {
        for (let iface in devs[phy]) {
          let iface_map = devs[phy][iface]
          if (iface_map.type == 'managed') {
            devS.push({ label: iface, value: iface })
          }
        }
        setDevSelect(devS)
      }
    })
  }

  const toggleWifiScan = (v) => {
    let newConfig = taskConfig
    newConfig.WiFiScan.Disabled = v
    //call PUT
    setTaskConfig(newConfig)
  }

  const toggleUplinkCheck = (v) => {}

  const submitWiFiTask = () => {
    if (scanIface == '' || scanIface == 'N/A') {
      context.error('No interface selected')
      return
    }
    pfwAPI
      .saveWifiScanTask({
        Disabled: !wifiScanEnabled,
        Interfaces: [scanIface],
        Time: {
          CronExpr: timeMap[scanExpr]
        }
      })
      .then((ok) => {
        context.success('Saved WiFi Scan Task')
      })
      .catch((err) => {
        context.error('Failed to save wifi task', err)
      })
  }

  const submitUplinkTask = () => {
    if (uplinkCheckAddress == '') {
      context.error('No address, need an IP')
      return
    }

    let addr = uplinkCheckType + ':' + uplinkCheckAddress
    if (uplinkCheckType == 'tcp') {
      if (uplinkCheckPort == '') {
        context.error('No port, need a port for TCP checks')
        return
      }

      addr = uplinkCheckType + ':' + uplinkCheckAddress + ':' + uplinkCheckPort
    }
    pfwAPI
      .saveUplinkCheckTask({
        Disabled: !wifiScanEnabled,
        Addresses: [addr],
        Time: {
          CronExpr: timeMap[scanExpr]
        }
      })
      .then((ok) => {
        context.success('Saved Uplink Check Task')
      })
      .catch((err) => {
        context.error('Failed to save wifi task', err)
      })
  }
  const timeMap = {
    '5 Minutes': '*/5 * * * *',
    '10 Minutes': '*/10 * * * *',
    '15 Minutes': '*/15 * * * *',
    '30 Minutes': '0,30 * * * *',
    Hourly: '0 * * * *',
    'Every 12 Hours': '0 */12 * * *',
    Daily: '0 0 * * *'
  }

  const timeOptions = Object.keys(timeMap).map((value) => ({
    label: value,
    value
    //icon: ClockIcon
  }))

  return (
    <VStack
      space="md"
      p="$4"
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
    >
      <Heading size="md">
        Schedule periodic tasks that publish "task:" events.
      </Heading>

      <VStack
        space="4xl"
        sx={{
          '@md': { flexDirection: 'row', maxWidth: '$3/4' }
        }}
      >
        <VStack flex={1} space="md">
          <Text bold>Scan Wireless APs</Text>
          <FormControl>
            <Checkbox
              size="sm"
              value={wifiScanEnabled}
              isChecked={wifiScanEnabled}
              onChange={toggleWifiScan}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Enabled</CheckboxLabel>
            </Checkbox>
          </FormControl>

          <FormControl w="$2/3">
            <FormControlLabel>
              <FormControlLabelText>WiFi Interface</FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={scanIface}
              onValueChange={(value) => {
                setScanIface(value)
              }}
              accessibilityLabel="Wifi Interface"
            >
              {devSelect.map((dev) => (
                <Select.Item
                  key={dev.label}
                  label={dev.label}
                  value={dev.value}
                />
              ))}
            </Select>
          </FormControl>

          <FormControl w="$2/3">
            <FormControlLabel>
              <FormControlLabelText>Frequency</FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={scanExpr}
              onValueChange={(v) => setScanExpr(v)}
            >
              {timeOptions.map((dev) => (
                <Select.Item
                  key={dev.label}
                  label={dev.label}
                  value={dev.value}
                />
              ))}
            </Select>
          </FormControl>

          <Button action="primary" onPress={submitWiFiTask}>
            <ButtonText>Save</ButtonText>
          </Button>
        </VStack>

        <VStack flex={1} space="md">
          <Text bold>Check Connectivity to IP or TCP Destination</Text>
          <FormControl>
            <Checkbox
              size="sm"
              value={taskConfig.UplinkCheck?.Disabled ? false : true}
              onChange={toggleUplinkCheck}
              isChecked={taskConfig.UplinkCheck?.Disabled ? false : true}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Enabled</CheckboxLabel>
            </Checkbox>
          </FormControl>

          <FormControl>
            <HStack space="md">
              <VStack flex={1}>
                <Select
                  selectedValue={uplinkCheckType}
                  onValueChange={(v) => setUplinkCheckType(v)}
                >
                  <Select.Item key="ip" label="ip" value="ip" />
                  <Select.Item key="tcp" label="tcp" value="tcp" />
                </Select>
                <FormControlHelper>
                  <FormControlHelperText>Type</FormControlHelperText>
                </FormControlHelper>
              </VStack>

              <VStack flex={1}>
                <Input type="text">
                  <InputField
                    value={uplinkCheckAddress}
                    onChangeText={(value) => setUplinkCheckAddress(value)}
                  />
                </Input>
                <FormControlHelper>
                  <FormControlHelperText>Address</FormControlHelperText>
                </FormControlHelper>
              </VStack>

              {uplinkCheckType == 'tcp' ? (
                <VStack flex={1}>
                  <Input type="text">
                    <InputField
                      value={uplinkCheckPort}
                      onChangeText={(value) => setUplinkCheckPort(value)}
                    />
                  </Input>
                  <FormControlHelper>
                    <FormControlHelperText>Port</FormControlHelperText>
                  </FormControlHelper>
                </VStack>
              ) : null}
            </HStack>
          </FormControl>

          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Frequency</FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={uplinkExpr}
              onValueChange={(v) => setUplinkExpr(v)}
            >
              {timeOptions.map((dev) => (
                <Select.Item
                  key={dev.label}
                  label={dev.label}
                  value={dev.value}
                />
              ))}
            </Select>
          </FormControl>

          <Button action="primary" onPress={submitUplinkTask}>
            <ButtonText>Save</ButtonText>
          </Button>
        </VStack>
      </VStack>
    </VStack>
  )
}

export default PFWTasks
