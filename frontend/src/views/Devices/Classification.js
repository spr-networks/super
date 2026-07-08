import React, { useContext, useEffect, useState } from 'react'
import { AlertContext } from 'AppContext'
import { classifyAPI } from 'api'

import {
  AddIcon,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  HStack,
  Icon,
  Input,
  InputField,
  ScrollView,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { FingerprintIcon } from 'lucide-react-native'

import { ListHeader } from 'components/List'
import { Select } from 'components/Select'

const attributes = [
  { value: 'hostname', label: 'Hostname', placeholder: '^myvacuum' },
  { value: 'oui', label: 'OUI (MAC prefix)', placeholder: '^b8:27:eb' },
  { value: 'mac_vendor', label: 'MAC Vendor', placeholder: 'Espressif' },
  { value: 'mdns_service', label: 'mDNS Service', placeholder: '_ipp\\._tcp' },
  { value: 'mdns_txt', label: 'mDNS TXT', placeholder: '^md=Chromecast' },
  { value: 'ssdp', label: 'SSDP Header', placeholder: 'Roku' }
]

const patternPlaceholder = (signalType) =>
  attributes.find((a) => a.value == signalType)?.placeholder || ''

const emptyRule = {
  SignalType: 'hostname',
  Pattern: '',
  Vendor: '',
  Category: '',
  Weight: 2
}

const normalizeRules = (rules) =>
  rules.map((rule) => ({
    ...rule,
    Category: rule.Category.trim().toLowerCase(),
    Vendor: rule.Vendor.trim(),
    Pattern: rule.Pattern.trim(),
    Weight: parseInt(rule.Weight) || 1
  }))

const RuleField = ({ label, flex, children }) => (
  <VStack flex={flex} space="xs" minWidth={120}>
    <Text size="xs" color="$muted500">
      {label}
    </Text>
    {children}
  </VStack>
)

const RuleRow = ({ rule, onChange, onRemove }) => (
  <HStack
    space="md"
    alignItems="flex-end"
    flexWrap="wrap"
    pb="$2"
    borderBottomWidth={1}
    borderColor="$coolGray200"
    sx={{ _dark: { borderColor: '$muted700' } }}
  >
    <RuleField label="Attribute">
      <Select
        selectedValue={rule.SignalType}
        onValueChange={(value) => onChange('SignalType', value)}
        size="sm"
      >
        {attributes.map((attribute) => (
          <Select.Item
            key={attribute.value}
            label={attribute.label}
            value={attribute.value}
          />
        ))}
      </Select>
    </RuleField>

    <RuleField label="Pattern (regex)" flex={2}>
      <Input size="sm">
        <InputField
          value={rule.Pattern}
          placeholder={patternPlaceholder(rule.SignalType)}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => onChange('Pattern', value)}
        />
      </Input>
    </RuleField>

    <RuleField label="Type" flex={1}>
      <Input size="sm">
        <InputField
          value={rule.Category}
          placeholder="camera"
          autoCapitalize="none"
          onChangeText={(value) => onChange('Category', value)}
        />
      </Input>
    </RuleField>

    <RuleField label="Brand (optional)" flex={1}>
      <Input size="sm">
        <InputField
          value={rule.Vendor}
          placeholder="Reolink"
          onChangeText={(value) => onChange('Vendor', value)}
        />
      </Input>
    </RuleField>

    <RuleField label="Weight">
      <Input size="sm" w="$16">
        <InputField
          value={String(rule.Weight)}
          keyboardType="numeric"
          onChangeText={(value) => onChange('Weight', value)}
        />
      </Input>
    </RuleField>

    <Button size="sm" action="negative" variant="link" onPress={onRemove}>
      <ButtonIcon as={CloseIcon} />
    </Button>
  </HStack>
)

const Classification = () => {
  const context = useContext(AlertContext)
  const [customRules, setCustomRules] = useState([])
  const [builtinRules, setBuiltinRules] = useState([])
  const [overridden, setOverridden] = useState(false)
  const [editedCustom, setEditedCustom] = useState(false)
  const [editedBuiltin, setEditedBuiltin] = useState(false)

  useEffect(() => {
    classifyAPI
      .customFingerprints()
      .then(setCustomRules)
      .catch(() => {})

    classifyAPI
      .builtinFingerprints()
      .then((result) => {
        setBuiltinRules(result.Rules || [])
        setOverridden(!!result.Overridden)
      })
      .catch(() => {})
  }, [])

  const showError = (err) => {
    if (err.response) {
      err.response
        .text()
        .then((body) => context.error('Invalid rule: ' + body))
    } else {
      context.error('Failed to save rules: ' + err.message)
    }
  }

  const saveRules = async () => {
    try {
      if (editedCustom) {
        let saved = await classifyAPI.setCustomFingerprints(
          normalizeRules(customRules)
        )
        setCustomRules(saved)
        setEditedCustom(false)
      }
      if (editedBuiltin) {
        let saved = await classifyAPI.setBuiltinFingerprints(
          normalizeRules(builtinRules)
        )
        setBuiltinRules(saved.Rules || [])
        setOverridden(true)
        setEditedBuiltin(false)
      }
      context.success('Rules saved, devices re-scored')
    } catch (err) {
      showError(err)
    }
  }

  const resetBuiltins = () => {
    classifyAPI
      .resetBuiltinFingerprints()
      .then(() => classifyAPI.builtinFingerprints())
      .then((result) => {
        setBuiltinRules(result.Rules || [])
        setOverridden(false)
        setEditedBuiltin(false)
        context.success('Built-in rules restored to defaults')
      })
      .catch(showError)
  }

  const addRule = () => {
    setCustomRules(customRules.concat({ ...emptyRule }))
    setEditedCustom(true)
  }

  return (
    <ScrollView h="$full">
      <ListHeader
        title="Classification"
        description="Rules to set device classification tags"
      >
        <HStack space="md">
          <Button
            size="sm"
            action="secondary"
            variant="outline"
            onPress={addRule}
          >
            <ButtonIcon as={AddIcon} mr="$1" />
            <ButtonText>Add Rule</ButtonText>
          </Button>
          <Button
            size="sm"
            action="primary"
            onPress={saveRules}
            isDisabled={!editedCustom && !editedBuiltin}
          >
            <ButtonText>Save</ButtonText>
          </Button>
        </HStack>
      </ListHeader>

      <VStack
        space="md"
        p="$4"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
      >
        <Text bold size="sm">
          Your Rules
        </Text>

        {!customRules.length ? (
          <VStack space="md" alignItems="center" py="$4">
            <Icon as={FingerprintIcon} color="$muted400" size={32} />
            <Text color="$muted500" size="sm">
              Set classification rules
            </Text>
            <Button size="sm" action="primary" onPress={addRule}>
              <ButtonIcon as={AddIcon} mr="$1" />
              <ButtonText>Add Rule</ButtonText>
            </Button>
          </VStack>
        ) : null}

        {customRules.map((rule, index) => (
          <RuleRow
            key={index}
            rule={rule}
            onChange={(field, value) => {
              setCustomRules(
                customRules.map((r, i) =>
                  i == index ? { ...r, [field]: value } : r
                )
              )
              setEditedCustom(true)
            }}
            onRemove={() => {
              setCustomRules(customRules.filter((_, i) => i != index))
              setEditedCustom(true)
            }}
          />
        ))}

        <HStack space="md" alignItems="center" pt="$4">
          <Text bold size="sm">
            Built-in Rules
          </Text>
          {overridden ? (
            <Button
              size="xs"
              action="secondary"
              variant="link"
              onPress={resetBuiltins}
            >
              <ButtonText>Reset to defaults</ButtonText>
            </Button>
          ) : null}
        </HStack>

        {builtinRules.map((rule, index) => (
          <RuleRow
            key={index}
            rule={rule}
            onChange={(field, value) => {
              setBuiltinRules(
                builtinRules.map((r, i) =>
                  i == index ? { ...r, [field]: value } : r
                )
              )
              setEditedBuiltin(true)
            }}
            onRemove={() => {
              setBuiltinRules(builtinRules.filter((_, i) => i != index))
              setEditedBuiltin(true)
            }}
          />
        ))}
      </VStack>
    </ScrollView>
  )
}

export default Classification
