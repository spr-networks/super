import React, { useContext, useState } from 'react'
import { AlertContext } from 'AppContext'
import { firewallAPI } from 'api'
import {
  Box,
  Button,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  HStack,
  Input,
  InputField,
  VStack,
  Switch,
  Spinner
} from '@gluestack-ui/themed'
import { Select, SelectItem } from 'components/Select'

const AddServicePort = ({ notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const [Protocol, setProtocol] = useState('tcp')
  const [Port, setPort] = useState('0')
  const [UpstreamEnabled, setUpstreamEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = () => {
    let rule = {
      Protocol,
      Port,
      UpstreamEnabled
    }

    setIsLoading(true)

    firewallAPI
      .addServicePort(rule)
      .then((res) => {
        if (notifyChange) {
          notifyChange('service_port')
        }
        setIsLoading(false)
      })
      .catch((err) => {
        context.error('Firewall API Failure: ' + err)
        setIsLoading(false)
      })
  }

  return (
    <VStack space="md">
      <HStack space="md">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Protocol</FormControlLabelText>
          </FormControlLabel>
          <Select
            selectedValue={Protocol}
            onValueChange={(value) => setProtocol(value)}
          >
            <SelectItem label="tcp" value="tcp" />
            <SelectItem label="udp" value="udp" />
          </Select>
        </FormControl>
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Port</FormControlLabelText>
          </FormControlLabel>
          <Input w="100" size="md" variant="underlined">
            <InputField value={Port} onChangeText={(value) => setPort(value)} />
          </Input>
        </FormControl>
        <Box flex={1} alignItems="center" alignSelf="center">
          <FormControlLabel>
            <FormControlLabelText>Upstream Enabled</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={UpstreamEnabled}
            onToggle={() => setUpstreamEnabled(!UpstreamEnabled)}
          />
        </Box>
      </HStack>
      <Button
        action="primary"
        size="md"
        onPress={handleSubmit}
        isDisabled={isLoading}
      >
        {isLoading ? (
          <Spinner color="white" size="small" />
        ) : (
          <ButtonText>Save</ButtonText>
        )}
      </Button>
    </VStack>
  )
}

export default AddServicePort
