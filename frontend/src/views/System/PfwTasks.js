import React, {useContext, useEffect, useState} from 'react'
import { AlertContext } from 'layouts/Admin'
import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxLabel,
  CheckboxIndicator,
  ClockIcon,
  Input,
  InputField,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { pfwAPI } from 'api'
import InputSelect from 'components/InputSelect'


const PFWTasks = (props) => {
  const [taskConfig, setTaskConfig] = useState({})
  const [scanExpr, setScanExpr] = useState('10 Minutes')
  const [uplinkExpr, setUplinkExpr] = useState('10 Minutes')
  const [scanIface, setScanIface] = useState('wlan0')

  const context = useContext(AlertContext)
  useEffect(() => {
    getConfig()
  }, [])

  const getConfig = () => {
    pfwAPI
      .getTaskConfig()
      .then((config) => {
        setTaskConfig(config)
      })
      .catch((e) => {
        context.error('failed to get status')
      })
  }

  const toggleWifiScan = (v) => {
    let newConfig = taskConfig
    newConfig.WiFiScan.Disabled = v
    //call PUT
    setTaskConfig(newConfig)
  }

  const toggleUplinkCheck = (v) => {

  }

  const timeMap = {
    "5 Minutes": "*/5 * * * *",
    "10 Minutes": "*/10 * * * *",
    "15 Minutes": "*/15 * * * *",
    "30 Minutes": "0,30 * * * *",
    "Hourly": "0 * * * *",
    "Every 12 Hours": "0 */12 * * *",
    "Daily": "0 0 * * *"
  }

  const timeOptions = Object.keys(timeMap).map((value) => ({
    label: value,
    value,
    //icon: ClockIcon
  }))

  return (
    <VStack>
      <Text bold> Wireless Scans </Text>
      <VStack w="$1/2">
        <Checkbox
          size="sm"
          value={taskConfig.WiFiScan?.Disabled ? false : true}
          onChange={toggleWifiScan}
          isChecked={taskConfig.WiFiScan?.Disabled  ? false : true}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Enabled</CheckboxLabel>
        </Checkbox>

        <Input>
          <InputField
            placeholder="interface"
            name="wlan0"
            value={scanIface}
            onChangeText={(value) => setScanIface(value)}
          />
        </Input>

        {taskConfig.WiFiScan?.Interfaces?.map((iface, index) => (
          <Input key={index}>Interface: {iface}</Input>
        ))}

        <Text>Cron Expression: {taskConfig.WiFiScan?.Time.CronExpr}</Text>
        <Text bold>Refresh Frequency</Text>
        <InputSelect
          options={timeOptions}
          value={scanExpr}
          onChange={(v) => setScanExpr(v)}
          onChangeText={(v) => setScanExpr('10 Minutes')}
        />
        <Button action="primary" onPress={() => submitRefresh(seconds)}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>

      <Text bold> Uplink Check </Text>

      <VStack>

      <Checkbox
        size="sm"
        value={taskConfig.UplinkCheck?.Disabled ? false : true}
        onChange={toggleUplinkCheck}
        isChecked={taskConfig.UplinkCheck?.Disabled  ? false : true}
      >
        <CheckboxIndicator mr="$2">
          <CheckboxIcon />
        </CheckboxIndicator>
        <CheckboxLabel>Enabled</CheckboxLabel>
      </Checkbox>

        <Text>Addresses:</Text>
        {taskConfig.UplinkCheck?.Addresses?.map((address, index) => (
          <Text key={index}>{address}</Text>
        ))}
        <Text>Status: {taskConfig.UplinkCheck?.Disabled ? "Disabled" : "Enabled"}</Text>
        <Text>Cron Expression: {taskConfig.UplinkCheck?.Time.CronExpr}</Text>
      </VStack>
    </VStack>
  )
}

export default PFWTasks
