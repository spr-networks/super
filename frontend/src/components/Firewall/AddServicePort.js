import React, { useContext, useState } from 'react'
import { AlertContext } from 'AppContext'
import { firewallAPI } from 'api'
import {
  Box,
  Button,
  ButtonText,
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
  Switch,
  Spinner
} from '@gluestack-ui/themed'
import { Select, SelectItem } from 'components/Select'

const AddServicePort = ({ notifyChange, item, ...props }) => {
  const context = useContext(AlertContext)
  const editing = !!item
  const [Protocol, setProtocol] = useState(item?.Protocol || 'tcp')
  const [Port, setPort] = useState(item?.Port || '')
  const [UpstreamEnabled, setUpstreamEnabled] = useState(
    item?.UpstreamEnabled || false
  )
  const [Description, setDescription] = useState(item?.Description || '')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = () => {
    let rule = {
      Protocol,
      Port,
      UpstreamEnabled,
      Description
    }

    setIsLoading(true)

    const persist = () =>
      firewallAPI
        .addServicePort(rule)
        .then((res) => {
          if (notifyChange) {
            notifyChange('service_port')
          }
          setIsLoading(false)
        })
        .catch((err) => {
          if (editing) {
            firewallAPI.addServicePort(item).catch(() => {})
          }
          context.error('Firewall API Failure: ' + err)
          setIsLoading(false)
        })

    if (editing) {
      firewallAPI
        .deleteServicePort(item)
        .then(() => persist())
        .catch((err) => {
          context.error('Firewall API Failure: ' + err)
          setIsLoading(false)
        })
    } else {
      persist()
    }
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
            <InputField
              autoComplete="off"
              placeholder="e.g. 8080"
              value={Port}
              onChangeText={(value) => setPort(value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              The port to open on the router (e.g. 443 for HTTPS, 22 for SSH).
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <Box flex={1} alignItems="center" alignSelf="center">
          <FormControlLabel>
            <FormControlLabelText>Allow from Internet (WAN)</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={UpstreamEnabled}
            onToggle={() => setUpstreamEnabled(!UpstreamEnabled)}
          />
          <Text size="xs" color="$muted500">
            When off, only devices on your LAN can reach this port. When on,
            it's reachable from the internet — only enable for services you
            intend to expose.
          </Text>
        </Box>
      </HStack>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Description</FormControlLabelText>
        </FormControlLabel>
        <Input size="md" variant="underlined">
          <InputField
            autoComplete="off"
            placeholder="Optional label"
            value={Description}
            onChangeText={(value) => setDescription(value)}
          />
        </Input>
      </FormControl>
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
