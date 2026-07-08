import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform, Linking } from 'react-native'
import { useLocation } from 'react-router-dom'
import { AlertContext } from 'AppContext'
import { classifyAPI } from 'api'

import {
  AddIcon,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Icon,
  Input,
  InputField,
  ScrollView,
  Text,
  TrashIcon,
  VStack
} from '@gluestack-ui/themed'

import { FingerprintIcon, Share2Icon } from 'lucide-react-native'

import { ListHeader } from 'components/List'
import { Select } from 'components/Select'

const attributes = [
  { value: 'hostname', label: 'Hostname', placeholder: '^myvacuum' },
  { value: 'oui', label: 'OUI (MAC prefix)', placeholder: '^b8:27:eb' },
  { value: 'mac_vendor', label: 'MAC Vendor', placeholder: 'Espressif' },
  { value: 'mdns_service', label: 'mDNS Service', placeholder: '_ipp\\._tcp' },
  { value: 'mdns_txt', label: 'mDNS TXT', placeholder: '^md=Chromecast' },
  { value: 'ssdp', label: 'SSDP Header', placeholder: 'Roku' },
  { value: 'dns', label: 'DNS Query', placeholder: '\\.ring\\.com$' },
  { value: 'vendor_class', label: 'DHCP Vendor Class', placeholder: '^android-dhcp' },
  { value: 'dhcp_params', label: 'DHCP Params (opt 55)', placeholder: '^1,121,3,6' }
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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// signals from a device fingerprint as candidate (attribute, pattern) pairs
const fingerprintCandidates = (fingerprint) => {
  let candidates = []

  if (fingerprint.Hostname) {
    candidates.push({
      attribute: 'hostname',
      display: fingerprint.Hostname,
      pattern: '^' + escapeRegex(fingerprint.Hostname.replace(/[-_]?\d+$/, ''))
    })
  }
  if (fingerprint.OUI) {
    candidates.push({
      attribute: 'oui',
      display: fingerprint.OUI,
      pattern: '^' + escapeRegex(fingerprint.OUI)
    })
  }
  if (fingerprint.OUIVendor) {
    candidates.push({
      attribute: 'mac_vendor',
      display: fingerprint.OUIVendor,
      pattern: escapeRegex(fingerprint.OUIVendor)
    })
  }
  for (let service of fingerprint.Services || []) {
    candidates.push({
      attribute: 'mdns_service',
      display: service,
      pattern: escapeRegex(service)
    })
  }
  for (let key of Object.keys(fingerprint.TXT || {})) {
    if (key.match(/auth|token|secret|nonce|seed|key/i)) {
      continue
    }
    candidates.push({
      attribute: 'mdns_txt',
      display: `${key}=${fingerprint.TXT[key]}`,
      pattern: '^' + escapeRegex(`${key}=${fingerprint.TXT[key]}`)
    })
  }
  for (let key of Object.keys(fingerprint.SSDPHeaders || {})) {
    candidates.push({
      attribute: 'ssdp',
      display: `${key}: ${fingerprint.SSDPHeaders[key]}`,
      pattern: escapeRegex(fingerprint.SSDPHeaders[key])
    })
  }
  for (let domain of fingerprint.Domains || []) {
    candidates.push({
      attribute: 'dns',
      display: domain,
      pattern: escapeRegex(domain) + '$'
    })
  }
  if (fingerprint.VendorClass) {
    candidates.push({
      attribute: 'vendor_class',
      display: fingerprint.VendorClass,
      pattern: '^' + escapeRegex(fingerprint.VendorClass)
    })
  }
  if (fingerprint.ParamReqList) {
    candidates.push({
      attribute: 'dhcp_params',
      display: fingerprint.ParamReqList,
      pattern: '^' + escapeRegex(fingerprint.ParamReqList) + '$'
    })
  }

  return candidates
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

const shareRule = (rule) => {
  const target = [rule.Vendor, rule.Category].filter((p) => p).join(' ')
  const title = `Shared SPR fingerprint rule: ${target || rule.Pattern}`
  const body = [
    `Classification rule for "${target}".`,
    '',
    '```json',
    JSON.stringify(
      {
        SignalType: rule.SignalType,
        Pattern: rule.Pattern,
        Vendor: rule.Vendor,
        Category: rule.Category,
        Weight: parseInt(rule.Weight) || 1
      },
      null,
      2
    ),
    '```',
    '',
    '#492'
  ].join('\n')

  const url =
    'https://github.com/spr-networks/super/issues/new' +
    '?title=' +
    encodeURIComponent(title) +
    '&body=' +
    encodeURIComponent(body)

  if (Platform.OS == 'web' && typeof window != 'undefined') {
    window.open(url, '_blank')
  } else {
    Linking.openURL(url).catch(() => {})
  }
}

const RuleRow = ({ rule, onChange, onRemove, onShare }) => (
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

    {onShare ? (
      <Button size="sm" action="secondary" variant="link" onPress={onShare}>
        <ButtonIcon as={Share2Icon} />
      </Button>
    ) : null}

    <Button size="sm" action="negative" variant="link" onPress={onRemove}>
      <ButtonIcon as={TrashIcon} />
    </Button>
  </HStack>
)

const Classification = () => {
  const context = useContext(AlertContext)
  const location = useLocation()
  const [customRules, setCustomRules] = useState([])
  const [builtinRules, setBuiltinRules] = useState([])
  const [overridden, setOverridden] = useState(false)
  const [editedCustom, setEditedCustom] = useState(false)
  const [editedBuiltin, setEditedBuiltin] = useState(false)
  const [fingerprint, setFingerprint] = useState(null)
  const [fingerprintName, setFingerprintName] = useState('')
  const [draftIndex, setDraftIndex] = useState(null)
  const consumedDraft = useRef(false)

  useEffect(() => {
    classifyAPI
      .customFingerprints()
      .then((rules) => {
        // a draft rule handed over from a device page stays unsaved until
        // the user hits Save
        if (location.state?.draftRule && !consumedDraft.current) {
          consumedDraft.current = true
          setDraftIndex(rules.length)
          setFingerprint(location.state.fingerprint || null)
          setFingerprintName(location.state.deviceName || '')
          setEditedCustom(true)
          setCustomRules(rules.concat({ ...emptyRule, ...location.state.draftRule }))
          return
        }
        setCustomRules(rules)
      })
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

  const deleteCustomRule = async (index) => {
    let next = customRules.filter((_, i) => i != index)

    if (draftIndex != null && index == draftIndex) {
      //the draft was never saved, drop it locally
      setCustomRules(next)
      setDraftIndex(null)
      return
    }

    let nextDraftIndex =
      draftIndex != null && index < draftIndex ? draftIndex - 1 : draftIndex
    //never persist an unsaved draft as a side effect of deleting
    let toPersist =
      nextDraftIndex != null ? next.filter((_, i) => i != nextDraftIndex) : next

    try {
      await classifyAPI.setCustomFingerprints(normalizeRules(toPersist))
      setCustomRules(next)
      setDraftIndex(nextDraftIndex)
      setEditedCustom(nextDraftIndex != null)
      context.success('Rule deleted')
    } catch (err) {
      showError(err)
    }
  }

  const deleteBuiltinRule = async (index) => {
    let next = builtinRules.filter((_, i) => i != index)
    try {
      let saved = await classifyAPI.setBuiltinFingerprints(normalizeRules(next))
      setBuiltinRules(saved.Rules || [])
      setOverridden(true)
      setEditedBuiltin(false)
      context.success('Rule deleted')
    } catch (err) {
      showError(err)
    }
  }

  const useCandidate = (candidate) => {
    if (draftIndex == null || draftIndex >= customRules.length) {
      return
    }
    setCustomRules(
      customRules.map((rule, i) =>
        i == draftIndex
          ? { ...rule, SignalType: candidate.attribute, Pattern: candidate.pattern }
          : rule
      )
    )
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

        {fingerprint ? (
          <VStack
            space="xs"
            p="$3"
            rounded="$lg"
            borderWidth={1}
            borderColor="$coolGray200"
            bg="$backgroundLight50"
            sx={{
              _dark: { bg: '$backgroundDark800', borderColor: '$muted700' }
            }}
          >
            <Text bold size="sm">
              Fingerprint from {fingerprintName}
            </Text>
            <Text size="xs" color="$muted500">
              Pick which signal the rule below should match, then adjust the
              pattern and save
            </Text>
            {fingerprintCandidates(fingerprint).map((candidate, index) => (
              <HStack
                key={`${candidate.attribute}:${index}`}
                space="md"
                alignItems="center"
              >
                <Text size="xs" color="$muted500" w={100}>
                  {candidate.attribute}
                </Text>
                <Text size="xs" flex={1} isTruncated>
                  {candidate.display}
                </Text>
                <Button
                  size="xs"
                  action="secondary"
                  variant="outline"
                  onPress={() => useCandidate(candidate)}
                >
                  <ButtonText>Use</ButtonText>
                </Button>
              </HStack>
            ))}
          </VStack>
        ) : null}

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
            onShare={() => shareRule(rule)}
            onChange={(field, value) => {
              setCustomRules(
                customRules.map((r, i) =>
                  i == index ? { ...r, [field]: value } : r
                )
              )
              setEditedCustom(true)
            }}
            onRemove={() => deleteCustomRule(index)}
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
            onRemove={() => deleteBuiltinRule(index)}
          />
        ))}
      </VStack>
    </ScrollView>
  )
}

export default Classification
