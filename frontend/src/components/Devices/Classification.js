import React, { useState } from 'react'

import {
  Badge,
  BadgeIcon,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Icon,
  Menu,
  MenuItem,
  MenuItemLabel,
  Pressable,
  Text,
  useColorMode,
  VStack
} from '@gluestack-ui/themed'

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FingerprintIcon,
  HelpCircleIcon,
  PinIcon,
  PlusIcon,
  RotateCcwIcon,
  Share2Icon
} from 'lucide-react-native'

import IconItem, { deviceIcons } from 'components/IconItem'
import { GroupItem, PolicyItem } from 'components/TagItem'

const categoryOptions = [
  'camera',
  'printer',
  'tv',
  'speaker',
  'console',
  'iot-sensor',
  'phone',
  'tablet',
  'laptop',
  'wearable',
  'router',
  'switch',
  'server'
]

export const categoryStyle = {
  camera: { Icon: 'Video', Color: 'red' },
  console: { Icon: 'Gamepad', Color: 'purple' },
  'iot-sensor': { Icon: 'Wifi', Color: 'amber' },
  laptop: { Icon: 'Laptop', Color: 'blueGray' },
  phone: { Icon: 'Mobile', Color: 'cyan' },
  printer: { Icon: 'Printer', Color: 'teal' },
  router: { Icon: 'Router', Color: 'blueGray' },
  server: { Icon: 'Server', Color: 'green' },
  speaker: { Icon: 'Speaker', Color: 'fuchsia' },
  switch: { Icon: 'Ethernet', Color: 'teal' },
  tablet: { Icon: 'Tablet', Color: 'cyan' },
  tv: { Icon: 'Tv', Color: 'violet' },
  wearable: { Icon: 'Watch', Color: 'pink' },
  unknown: { Icon: 'Laptop', Color: 'blueGray' }
}

const confidenceStyle = {
  High: { color: '$green500', label: 'High confidence' },
  Medium: { color: '$amber500', label: 'Medium confidence' },
  Low: { color: '$muted400', label: 'Low confidence' },
  Unknown: { color: '$muted400', label: 'Not enough signals' }
}

const isUnknown = (classification) =>
  !classification?.Category || classification.Category == 'unknown'

export const displayGuess = (classification) => {
  if (isUnknown(classification)) {
    //an unknown category with a known vendor is still worth naming
    return classification?.Vendor
      ? `${classification.Vendor} device`
      : 'Unidentified device'
  }

  let parts = [classification.Vendor, classification.Category].filter(
    (part) => part && part != 'unknown'
  )

  return parts.join(' ')
}

const ConfidenceDot = ({ confidence, detail }) => {
  let style = confidenceStyle[confidence] || confidenceStyle.Unknown

  return (
    <HStack space="xs" alignItems="center">
      <Box w="$2" h="$2" rounded="$full" bg={style.color} />
      <Text size="sm" color="$muted500">
        {style.label}
        {detail ? ` · ${detail}` : ''}
      </Text>
    </HStack>
  )
}

const CategoryCoin = ({ category, size }) => {
  let style = categoryStyle[category] || categoryStyle.unknown

  return (
    <Box
      p="$2"
      rounded="$full"
      bg="$backgroundLight100"
      borderColor="$coolGray200"
      borderWidth={1}
      sx={{ _dark: { bg: '$backgroundDark700', borderColor: '$muted700' } }}
    >
      {isUnknown({ Category: category }) ? (
        <Icon as={HelpCircleIcon} color="$muted400" size={size || 24} />
      ) : (
        <IconItem
          name={style.Icon}
          color={`$${style.Color}500`}
          size={size || 24}
        />
      )}
    </Box>
  )
}

const CorrectionMenu = ({
  classification,
  onCorrection,
  onReset,
  onCustom,
  onBrand
}) => {
  let category = classification?.Category

  let label = 'Tell SPR what this is'
  if (!isUnknown(classification)) {
    label = classification.UserCorrection ? 'Change type' : `Not a ${category}?`
  }

  return (
    <Menu
      trigger={(triggerProps) => (
        <Button size="xs" action="secondary" variant="outline" {...triggerProps}>
          <ButtonText>{label}</ButtonText>
          <ButtonIcon as={ChevronDownIcon} ml="$1" />
        </Button>
      )}
      selectionMode="single"
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (!key || key == category) {
          return
        }
        if (key == '__auto') {
          onReset()
        } else if (key == '__custom') {
          onCustom()
        } else if (key == '__brand') {
          onBrand()
        } else {
          onCorrection(key)
        }
      }}
    >
      {categoryOptions.map((option) => (
        <MenuItem key={option} textValue={option}>
          <IconItem
            name={categoryStyle[option].Icon}
            color="$muted500"
            size={16}
          />
          <MenuItemLabel size="sm" ml="$2">
            {option}
          </MenuItemLabel>
          {option == category ? (
            <Icon as={CheckCircle2Icon} color="$green500" size={16} ml="auto" />
          ) : null}
        </MenuItem>
      ))}
      {onCustom ? (
        <MenuItem key="__custom" textValue="custom type">
          <Icon as={PlusIcon} color="$muted500" size={16} />
          <MenuItemLabel size="sm" ml="$2">
            Custom type...
          </MenuItemLabel>
        </MenuItem>
      ) : null}
      {onBrand ? (
        <MenuItem key="__brand" textValue="set brand">
          <Icon as={PlusIcon} color="$muted500" size={16} />
          <MenuItemLabel size="sm" ml="$2">
            Set brand...
          </MenuItemLabel>
        </MenuItem>
      ) : null}
      {classification?.UserCorrection && onReset ? (
        <MenuItem key="__auto" textValue="reset to automatic">
          <Icon as={RotateCcwIcon} color="$muted500" size={16} />
          <MenuItemLabel size="sm" ml="$2">
            Reset to automatic
          </MenuItemLabel>
        </MenuItem>
      ) : null}
    </Menu>
  )
}

const EvidenceDisclosure = ({ evidence }) => {
  const [open, setOpen] = useState(false)

  if (!evidence?.length) {
    return null
  }

  return (
    <VStack space="xs">
      <Pressable onPress={() => setOpen(!open)}>
        <HStack space="xs" alignItems="center">
          <Icon
            as={open ? ChevronDownIcon : ChevronRightIcon}
            color="$muted500"
            size={16}
          />
          <Text size="sm" color="$muted500">
            Why? · {evidence.length}{' '}
            {evidence.length == 1 ? 'signal' : 'signals'}
          </Text>
        </HStack>
      </Pressable>

      {open ? (
        <VStack space="xs" pl="$6">
          {evidence.map((line, index) => (
            <HStack key={`${line}:${index}`} space="sm" alignItems="center">
              <Box w="$1" h="$1" rounded="$full" bg="$muted400" />
              <Text size="sm" color="$muted500" flex={1}>
                {line}
              </Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
    </VStack>
  )
}

export const isClassificationTag = (tag) => tag?.startsWith('classification:')

// device tag chip for classification:<category> tags, shows the category
// with the shared fingerprint icon instead of the raw tag text
export const ClassificationTag = ({ name, size }) => {
  const colorMode = useColorMode()

  let category = name.replace(/^classification:/, '')

  let bg = colorMode == 'light' ? '$blueGray200' : '$blueGray500'
  let fg = colorMode == 'light' ? '$muted800' : '$muted100'

  return (
    <Badge
      action="muted"
      variant="solid"
      bg={bg}
      size={size || 'sm'}
      py="$1"
      px="$2"
      rounded="$lg"
    >
      <BadgeText color={fg}>{category}</BadgeText>
      <BadgeIcon color={fg} as={FingerprintIcon} ml="$1" />
    </Badge>
  )
}

const fingerprintEntries = (fingerprint) => {
  let entries = []
  if (fingerprint.Hostname) {
    entries.push({ label: 'hostname', value: fingerprint.Hostname })
  }
  if (fingerprint.OUI) {
    entries.push({ label: 'oui', value: fingerprint.OUI })
  }
  if (fingerprint.OUIVendor) {
    entries.push({ label: 'mac vendor', value: fingerprint.OUIVendor })
  }
  if (fingerprint.VendorClass) {
    entries.push({ label: 'dhcp vendor class', value: fingerprint.VendorClass })
  }
  if (fingerprint.ParamReqList) {
    entries.push({ label: 'dhcp params', value: fingerprint.ParamReqList })
  }
  for (let service of fingerprint.Services || []) {
    entries.push({ label: 'mdns service', value: service })
  }
  for (let key of Object.keys(fingerprint.TXT || {})) {
    entries.push({ label: 'mdns txt', value: `${key}=${fingerprint.TXT[key]}` })
  }
  for (let key of Object.keys(fingerprint.SSDPHeaders || {})) {
    entries.push({ label: 'ssdp', value: `${key}: ${fingerprint.SSDPHeaders[key]}` })
  }
  for (let domain of fingerprint.Domains || []) {
    entries.push({ label: 'dns', value: domain })
  }
  return entries
}

const FingerprintDisclosure = ({ fingerprint }) => {
  const [open, setOpen] = useState(false)

  if (!fingerprint) {
    return null
  }

  let entries = fingerprintEntries(fingerprint)
  if (!entries.length) {
    return null
  }

  return (
    <VStack space="xs">
      <Pressable onPress={() => setOpen(!open)}>
        <HStack space="xs" alignItems="center">
          <Icon
            as={open ? ChevronDownIcon : ChevronRightIcon}
            color="$muted500"
            size={16}
          />
          <Text size="sm" color="$muted500">
            Fingerprint · {entries.length}{' '}
            {entries.length == 1 ? 'attribute' : 'attributes'}
          </Text>
        </HStack>
      </Pressable>

      {open ? (
        <VStack space="xs" pl="$6">
          {entries.map((entry, index) => (
            <HStack key={`${entry.label}:${index}`} space="sm">
              <Text size="sm" color="$muted500" w={140}>
                {entry.label}
              </Text>
              <Text size="sm" flex={1} isTruncated>
                {entry.value}
              </Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
    </VStack>
  )
}

// quiet badge for device list rows: shows an unapplied suggestion or unknown state
export const ClassificationBadge = ({ classification }) => {
  if (!classification) {
    return null
  }

  if (isUnknown(classification)) {
    return null
  }

  return (
    <Badge action="muted" variant="outline" size="sm" py="$1" px="$2" rounded="$lg">
      <BadgeText color="$muted500">{classification.Category}</BadgeText>
      <BadgeIcon color="$muted500" as={FingerprintIcon} ml="$1" />
    </Badge>
  )
}

export const ClassificationPanel = ({
  classification,
  fingerprint,
  deviceGroups,
  devicePolicies,
  onApply,
  onCorrection,
  onReset,
  onCustom,
  onBrand,
  onShare,
  onCreateRule
}) => {
  if (!classification) {
    return null
  }

  let unknown = isUnknown(classification)
  let suggestedGroups = classification.SuggestedGroups || []
  let suggestedPolicies = classification.SuggestedPolicies || []
  let hasSuggestion = suggestedGroups.length || suggestedPolicies.length

  let applied =
    hasSuggestion &&
    suggestedGroups.every((group) => (deviceGroups || []).includes(group)) &&
    suggestedPolicies.every((policy) => (devicePolicies || []).includes(policy))

  let canApply =
    classification.Confidence != 'Low' && classification.Confidence != 'Unknown'

  return (
    <Box
      rounded="$lg"
      borderWidth={1}
      borderColor="$coolGray200"
      bg="$backgroundLight50"
      p="$3"
      sx={{
        _dark: { bg: '$backgroundDark800', borderColor: '$muted700' }
      }}
    >
      <VStack space="md">
        <HStack space="md" alignItems="center">
          <CategoryCoin category={classification.Category} />

          <VStack flex={1}>
            <HStack space="sm" alignItems="center" flexWrap="wrap">
              <Text bold>{displayGuess(classification)}</Text>
              {classification.UserCorrection ? (
                <Badge action="muted" variant="outline" size="sm" rounded="$lg">
                  <BadgeIcon as={PinIcon} color="$muted500" />
                  <BadgeText color="$muted500" ml="$1">
                    Set by you
                  </BadgeText>
                </Badge>
              ) : null}
            </HStack>
            <ConfidenceDot
              confidence={classification.Confidence}
              detail={classification.Model}
            />
          </VStack>

          <CorrectionMenu
            classification={classification}
            onCorrection={onCorrection}
            onReset={onReset}
            onCustom={onCustom}
            onBrand={onBrand}
          />
        </HStack>

        {unknown ? (
          <Text size="sm" color="$muted500">
            SPR watches passively for signals while the device is active — no
            probing, nothing leaves the router.
          </Text>
        ) : null}

        {hasSuggestion && !applied ? (
          <HStack space="sm" alignItems="center" flexWrap="wrap">
            <Text size="sm" color="$muted500">
              Suggested:
            </Text>
            {suggestedGroups.map((group) => (
              <GroupItem key={group} name={group} size="sm" />
            ))}
            {suggestedPolicies.map((policy) => (
              <PolicyItem key={policy} name={policy} size="sm" />
            ))}
            {canApply ? (
              <Button size="xs" action="primary" onPress={onApply}>
                <ButtonText>Apply</ButtonText>
              </Button>
            ) : null}
          </HStack>
        ) : null}

        {applied ? (
          <HStack space="sm" alignItems="center" flexWrap="wrap">
            <Icon as={CheckCircle2Icon} color="$green500" size={16} />
            <Text size="sm" color="$muted500">
              Applied:
            </Text>
            {suggestedGroups.map((group) => (
              <GroupItem key={group} name={group} size="sm" />
            ))}
            {suggestedPolicies.map((policy) => (
              <PolicyItem key={policy} name={policy} size="sm" />
            ))}
          </HStack>
        ) : null}

        <HStack alignItems="flex-start" justifyContent="space-between">
          <VStack space="xs" flex={1}>
            <EvidenceDisclosure evidence={classification.Evidence} />
            <FingerprintDisclosure fingerprint={fingerprint} />
          </VStack>
          <HStack space="md" alignItems="center">
            {!unknown && onCreateRule ? (
              <Button
                size="xs"
                action="secondary"
                variant="link"
                onPress={onCreateRule}
              >
                <ButtonIcon as={FingerprintIcon} mr="$1" />
                <ButtonText>Create rule</ButtonText>
              </Button>
            ) : null}
            {!unknown && onShare ? (
              <Button
                size="xs"
                action="secondary"
                variant="link"
                onPress={onShare}
              >
                <ButtonIcon as={Share2Icon} mr="$1" />
                <ButtonText>Share fingerprint</ButtonText>
              </Button>
            ) : null}
          </HStack>
        </HStack>
      </VStack>
    </Box>
  )
}
