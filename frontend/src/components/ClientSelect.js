import React, { useEffect, useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Platform, StyleSheet, TouchableOpacity } from 'react-native'
import { deviceAPI, groupAPI, firewallAPI } from 'api'
import {
  GlobeIcon,
  TagIcon,
  BookCheckIcon,
  ChevronDownIcon,
  CheckIcon,
  Search,
  EditIcon,
  ServerIcon
} from 'lucide-react-native'
import {DeviceIcon} from 'components/Devices/Device'
import {
  Box,
  Text,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  InputSlot,
  InputIcon,
  Modal,
  ModalContent,
  ModalBody,
  ModalHeader,
  ModalCloseButton,
  Icon,
  Heading,
  VStack,
  HStack,
  FlatList,
  Pressable,
  Center,
  Badge,
  BadgeText,
  Spinner,
  ScrollView,
  Button
} from '@gluestack-ui/themed'

const CIDR_DEFAULTS = [
  {
    label: "All Traffic (0.0.0.0/0)",
    value: "0.0.0.0/0",
    icon: 'Globe',
    color: "$blue500"
  }
]

const TYPE_ICONS = {
  policy: BookCheckIcon,
  group: GlobeIcon,
  tag: TagIcon,
  endpoint: ServerIcon,
  default: GlobeIcon
}

const TYPE_COLORS = {
  policy: { bg: '$purple100', text: '$purple700' },
  group: { bg: '$green100', text: '$green700' },
  tag: { bg: '$amber100', text: '$amber700' },
  endpoint: { bg: '$teal100', text: '$teal700' },
  device: { bg: '$blue100', text: '$blue700' },
  default: { bg: '$blue100', text: '$blue700' }
}

const groupOptionsByType = (options) => {
  const groups = {
    devices: [],
    policies: [],
    tags: [],
    groups: [],
    endpoints: []
  }

  options.forEach(option => {
    if (typeof option.value === 'object') {
      if (option.value.Policy) {
        groups.policies.push(option)
      } else if (option.value.Tag) {
        groups.tags.push(option)
      } else if (option.value.Group) {
        groups.groups.push(option)
      } else if (option.value.Endpoint) {
        groups.endpoints.push(option)
      } else {
        groups.devices.push(option)
      }
    } else {
      groups.devices.push(option)
    }
  })

  return groups
}

const styles = StyleSheet.create({
  searchInput: {
    minHeight: Platform.OS === 'ios' ? 44 : 48,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listItem: {
    minHeight: Platform.OS === 'ios' ? 56 : 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
  }
});

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const ClientSelect = (props) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearchQuery = useDebounce(searchQuery, 150)
  const [allOptions, setAllOptions] = useState([])
  const [filteredOptions, setFilteredOptions] = useState([])
  const [selectedOption, setSelectedOption] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [groupedOptions, setGroupedOptions] = useState(null)
  const [inputValue, setInputValue] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [useCustomValue, setUseCustomValue] = useState(false)
  const [isDataLoaded, setIsDataLoaded] = useState(false)

  const cleanIp = (ip) => ip.replace(/\/.*/, '')

  const getIconForType = (type) => {
    return TYPE_ICONS[type] || TYPE_ICONS.default
  }

  const getColorForType = (type) => {
    return (TYPE_COLORS[type] || TYPE_COLORS.default).bg
  }

  const getTextColorForType = (type) => {
    return (TYPE_COLORS[type] || TYPE_COLORS.default).text
  }

  const areValuesEqual = (val1, val2) => {
    if (typeof val1 === 'object' && typeof val2 === 'object') {
      return JSON.stringify(val1) === JSON.stringify(val2)
    }
    return val1 === val2
  }

  useEffect(() => {
    if (isDataLoaded && !props.value) return;

    const loadOptions = async () => {
      setIsLoading(true)
      try {
        const devicesPromise = deviceAPI.list();

        let groupsPromise = null;
        let firewallConfigPromise = null;

        if (props.showGroups) {
          groupsPromise = groupAPI.list();
        }

        if (props.showEndpoints) {
          firewallConfigPromise = firewallAPI.config();
        }

        const devices = await devicesPromise;

        let deviceOptions = Object.values(devices)
          .filter((d) => d.RecentIP.length)
          .map((d) => {
            return {
              label: `${d.Name || d.RecentIP}`,
              value: cleanIp(d.RecentIP),
              icon: d.Style?.Icon || 'Laptop',
              color: d.Style?.Color || '$blue500',
              type: 'device',
              subtitle: d.RecentIP,
              rawStyle: d.Style
            }
          })

        if (props.show_CIDR_Defaults) {
          deviceOptions = CIDR_DEFAULTS.concat(...deviceOptions)
        }

        let allOptionsList = [...deviceOptions]

        if (props.showPolicies) {
          const policyOptions = [
            'api', 'wan', 'lan', 'dns', 'lan_upstream', 'disabled'
          ].map((t) => {
            return {
              label: t,
              value: { Policy: t },
              icon: 'BookCheck',
              color: '$purple500',
              type: 'policy',
              subtitle: 'Policy'
            }
          })

          allOptionsList = [...allOptionsList, ...policyOptions]
        }

        if (props.showGroups && groupsPromise) {
          try {
            const groups = await groupsPromise;
            const groupOptions = groups.map((g) => ({
              label: g.Name,
              value: { Group: g.Name },
              icon: 'Globe',
              color: '$green500',
              type: 'group',
              subtitle: 'Group'
            }))

            allOptionsList = [...allOptionsList, ...groupOptions]
          } catch (err) {
            console.error("Error loading groups:", err)
          }
        }

        if (props.showTags) {
          const tagNames = [...new Set(
            Object.values(devices)
              .map((device) => device.DeviceTags || [])
              .flat()
              .filter((tagName) => tagName !== '')
          )]

          const tagOptions = tagNames.map((t) => ({
            label: t,
            value: { Tag: t },
            icon: 'Tag',
            color: '$amber500',
            type: 'tag',
            subtitle: 'Tag'
          }))

          allOptionsList = [...allOptionsList, ...tagOptions]
        }

        if (props.showEndpoints && firewallConfigPromise) {
          try {
            const config = await firewallConfigPromise;
            const endpointOptions = config.Endpoints.map((e) => ({
              label: e.RuleName,
              value: { Endpoint: e.RuleName },
              icon: 'Server',
              color: '$teal500',
              type: 'endpoint',
              subtitle: 'Endpoint'
            }))

            allOptionsList = [...allOptionsList, ...endpointOptions]
          } catch (err) {
            console.error("Error loading endpoints:", err)
          }
        }

        const groupedOptionsData = groupOptionsByType(allOptionsList);

        setAllOptions(allOptionsList)
        setFilteredOptions(allOptionsList)
        setGroupedOptions(groupedOptionsData)
        setIsDataLoaded(true)

        if (props.value) {
          const found = allOptionsList.find(opt => {
            if (typeof opt.value === 'object' && typeof props.value === 'object') {
              return JSON.stringify(opt.value) === JSON.stringify(props.value)
            }
            return opt.value === props.value
          })

          if (found) {
            setSelectedOption(found)
            setInputValue("")
          } else if (typeof props.value === 'string') {
            setInputValue(props.value)
            setSelectedOption(null)
          }
        }
      } catch (err) {
        console.error("Error loading devices:", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadOptions()
  }, [props.value, props.show_CIDR_Defaults, props.showPolicies, props.showGroups, props.showTags, props.showEndpoints, isDataLoaded])

  useEffect(() => {
    if (!allOptions.length) return

    if (!debouncedSearchQuery) {
      setFilteredOptions(allOptions)
      setGroupedOptions(groupOptionsByType(allOptions))
      return
    }

    const lowercaseQuery = debouncedSearchQuery.toLowerCase()

    const filtered = allOptions.filter(opt =>
      opt.label.toLowerCase().includes(lowercaseQuery) ||
      (opt.subtitle && opt.subtitle.toLowerCase().includes(lowercaseQuery))
    )

    setFilteredOptions(filtered)
    setGroupedOptions(groupOptionsByType(filtered))

    setUseCustomValue(debouncedSearchQuery.trim() !== "" &&
      !filtered.some(opt => opt.label.toLowerCase() === lowercaseQuery))
  }, [debouncedSearchQuery, allOptions])

  const handleSelectOption = (option) => {
    setSelectedOption(option)
    setInputValue("")
    setIsModalOpen(false)

    if (props.onChange) {
      props.onChange(option.value)
    }
  }

  const handleInputChange = (text) => {
    setInputValue(text)
    setSelectedOption(null)

    if (props.onChange) {
      props.onChange(text)
    }
  }

  const handleSearchChange = (text) => {
    setSearchQuery(text)
  }

  const displayValue = useMemo(() => {
    if (selectedOption) {
      return selectedOption.label
    }

    if (inputValue) {
      return inputValue
    }

    return props.placeholder || 'Select client'
  }, [selectedOption, inputValue, props.placeholder])

  const renderSectionHeader = (title, count) => {
    if (count === 0) return null

    return (
      <HStack px="$4" py="$2" bg="$coolGray100" alignItems="center" justifyContent="space-between">
        <Text fontSize="$xs" fontWeight="$semibold" color="$muted700">{title}</Text>
        <Badge variant="outline" size="sm">
          <BadgeText>{count}</BadgeText>
        </Badge>
      </HStack>
    )
  }

  const renderItem = ({ item }) => {
    let isSelected = false

    if (selectedOption && item.value) {
      isSelected = areValuesEqual(selectedOption.value, item.value)
    }

    return (
      <TouchableOpacity
        onPress={() => handleSelectOption(item)}
        style={[
          styles.listItem,
          { backgroundColor: isSelected ? (Platform.OS === 'web' ? "$primary100" : '#E6F2FF') : 'transparent' }
        ]}
        activeOpacity={0.7}
      >
        <HStack space="md" alignItems="center">
          {item.type === 'device' ? (
            <Box p="$2">
              <DeviceIcon
                icon={item.icon}
                color={item.color}
              />
            </Box>
          ) : (
            <Box
              p="$2"
              borderRadius="$full"
              bg={getColorForType(item.type)}
            >
              <Icon
                as={getIconForType(item.type)}
                color={getTextColorForType(item.type)}
                size="sm"
              />
            </Box>
          )}

          <VStack flex={1} space="xs">
            <Text fontWeight={isSelected ? "$medium" : "$normal"}>{item.label}</Text>
            {item.subtitle && (
              <Text fontSize="$xs" color="$muted600">{item.subtitle}</Text>
            )}
          </VStack>

          {isSelected && (
            <Icon as={CheckIcon} color="$primary500" size="sm" />
          )}
        </HStack>
      </TouchableOpacity>
    )
  }

  return (
    <FormControl isDisabled={props.isDisabled}>
      {props.label && (
        <FormControlLabel mb="$1">
          <FormControlLabelText>{props.label}</FormControlLabelText>
        </FormControlLabel>
      )}

      <HStack space="sm" width="$full">
        <Box flex={1}>
          {isEditing ? (
            <Input
              size={props.size || "md"}
              isDisabled={props.isDisabled}
              borderRadius="$lg"
              borderColor="$primary300"
              bg="$primary50"
              sx={{
                ':hover': {
                  borderColor: "$primary400",
                  bg: "$primary50"
                },
                _dark: {
                  borderColor: "$primary700",
                  bg: "$primary900",
                  ':hover': {
                    borderColor: "$primary600",
                    bg: "$primary900"
                  }
                }
              }}
            >
              <InputField
                placeholder={props.placeholder || 'Enter value...'}
                value={inputValue}
                onChangeText={handleInputChange}
                autoFocus={true}
                onBlur={() => {
                  setIsEditing(false)
                  if (inputValue.trim() === '') {
                    setSelectedOption(null)
                  }
                }}
                onSubmitEditing={() => {
                  setIsEditing(false)
                  if (props.onSubmitEditing) {
                    props.onSubmitEditing(inputValue)
                  }
                }}
              />
            </Input>
          ) : (
            <TouchableOpacity
              onPress={() => !props.isDisabled && setIsModalOpen(true)}
              activeOpacity={0.7}
              style={{ borderRadius: 8 }}
            >
              <Input
                size={props.size || "md"}
                isDisabled={props.isDisabled}
                borderRadius="$lg"
                borderColor={(selectedOption || inputValue) ? "$primary300" : "$borderColor"}
                bg={(selectedOption || inputValue) ? "$primary50" : "$backgroundLight50"}
                sx={{
                  ':hover': {
                    borderColor: "$primary400",
                    bg: "$primary50"
                  },
                  _dark: {
                    borderColor: (selectedOption || inputValue) ? "$primary700" : "$borderColorDark",
                    bg: (selectedOption || inputValue) ? "$primary900" : "$backgroundDark800",
                    ':hover': {
                      borderColor: "$primary600",
                      bg: "$primary900"
                    }
                  }
                }}
              >
                <InputSlot pl="$3">
                  {selectedOption && (
                    <Box p="$1">
                      {selectedOption.type === 'device' ? (
                        <DeviceIcon
                          icon={selectedOption.icon}
                          color={selectedOption.color}
                        />
                      ) : (
                        <Box
                          p="$1"
                          borderRadius="$full"
                          bg={getColorForType(selectedOption.type)}
                        >
                          <Icon
                            as={getIconForType(selectedOption.type)}
                            color={getTextColorForType(selectedOption.type)}
                            size="xs"
                          />
                        </Box>
                      )}
                    </Box>
                  )}
                </InputSlot>
                <InputField
                  placeholder={props.placeholder || 'Select client'}
                  value={displayValue}
                  editable={false}
                  pointerEvents="none"
                />
                <InputSlot pr="$3">
                  <InputIcon as={ChevronDownIcon} />
                </InputSlot>
              </Input>
            </TouchableOpacity>
          )}
        </Box>
        {!isEditing && !props.isDisabled && (
          <TouchableOpacity
            onPress={() => setIsEditing(true)}
            style={{
              backgroundColor: Platform.OS === 'web' ? "$primary100" : '#E6F2FF',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 8,
              padding: 8,
              minWidth: 44,
              minHeight: 44
            }}
            activeOpacity={0.7}
          >
            <Icon as={EditIcon} color="$primary600" size="md" />
          </TouchableOpacity>
        )}
      </HStack>

      {props.helperText && (
        <Text fontSize="$xs" color="$muted500" mt="$1">
          {props.helperText}
        </Text>
      )}

      {!props.isDisabled && !isEditing && !props.helperText && (
        <Text fontSize="$xs" color="$muted500" mt="$1">
          Click to select from options or use edit button to enter custom value
        </Text>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        useRNModal={Platform.OS === 'web'}
        avoidKeyboard
        closeOnOverlayClick
      >
        <ModalContent
          borderRadius="$lg"
          width="$full"
          maxWidth={450}
          marginX="auto"
          overflow="hidden"
        >
          <ModalHeader
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            bg="$primary50"
            px="$4"
            py="$3"
          >
            <HStack alignItems="center" justifyContent="space-between" width="$full">
              <Heading size="sm">{props.label || 'Select Client'}</Heading>
              <ModalCloseButton>
                <Icon as={ChevronDownIcon} />
              </ModalCloseButton>
            </HStack>
          </ModalHeader>

          <ModalBody p="$0">
            <VStack>
              <Box
                style={styles.searchContainer}
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
              >
                <Input
                  size="md"
                  variant="outline"
                  borderRadius="$full"
                  bg="$coolGray50"
                  style={styles.searchInput}
                >
                  <InputSlot pl="$3">
                    <InputIcon as={Search} />
                  </InputSlot>
                  <InputField
                    placeholder="Search clients"
                    value={searchQuery}
                    onChangeText={handleSearchChange}
                    autoFocus={Platform.OS === 'web'}
                    style={{ fontSize: Platform.OS === 'ios' ? 16 : 14 }}
                    onSubmitEditing={() => {
                      if (searchQuery.trim()) {
                        setInputValue(searchQuery.trim());
                        setSelectedOption(null);
                        setIsModalOpen(false);
                        if (props.onChange) {
                          props.onChange(searchQuery.trim());
                        }
                      }
                    }}
                  />
                  </Input>
                {searchQuery.trim() && (
                  <Button
                    onPress={() => {
                      setInputValue(searchQuery.trim())
                      setSelectedOption(null)
                      setIsModalOpen(false)
                      if (props.onChange) {
                        props.onChange(searchQuery.trim())
                      }
                    }}
                    mt="$2"
                    variant="solid"
                    size="md"
                    bg="$primary500"
                    style={{ minHeight: Platform.OS === 'ios' ? 44 : 48 }}
                  >
                    <Text color="$white">Set "{searchQuery.trim()}"</Text>
                  </Button>
                )}
              </Box>

              {isLoading ? (
                <Center py="$8">
                  <Spinner size="lg" color="$primary500" />
                  <Text color="$muted600" mt="$2">Loading clients...</Text>
                </Center>
              ) : (
                <ScrollView maxHeight={400} showsVerticalScrollIndicator={true}>
                  {filteredOptions.length === 0 ? (
                    <Center py="$8">
                      {useCustomValue ? (
                        <>
                          <Text color="$muted600" fontWeight="$medium">No matching clients found</Text>
                        </>
                      ) : (
                        <>
                          <Box
                            p="$4"
                            borderRadius="$full"
                            bg="$coolGray100"
                            mb="$2"
                          >
                            <Icon as={Search} size="lg" color="$muted500" />
                          </Box>
                          <Text color="$muted600" fontWeight="$medium">No matching clients found</Text>
                          <Text color="$muted500" fontSize="$xs" mt="$1">Try a different search term</Text>
                        </>
                      )}
                    </Center>
                  ) : (
                    <VStack>
                      {groupedOptions?.policies.length > 0 && (
                        <>
                          {renderSectionHeader('Policies', groupedOptions.policies.length)}
                          {groupedOptions.policies.map((item, index) => (
                            <Box key={`policy-${index}`}>
                              {renderItem({ item })}
                            </Box>
                          ))}
                        </>
                      )}

                      {groupedOptions?.groups.length > 0 && (
                        <>
                          {renderSectionHeader('Groups', groupedOptions.groups.length)}
                          {groupedOptions.groups.map((item, index) => (
                            <Box key={`group-${index}`}>
                              {renderItem({ item })}
                            </Box>
                          ))}
                        </>
                      )}

                      {groupedOptions?.tags.length > 0 && (
                        <>
                          {renderSectionHeader('Tags', groupedOptions.tags.length)}
                          {groupedOptions.tags.map((item, index) => (
                            <Box key={`tag-${index}`}>
                              {renderItem({ item })}
                            </Box>
                          ))}
                        </>
                      )}

                      {groupedOptions?.endpoints.length > 0 && (
                        <>
                          {renderSectionHeader('Endpoints', groupedOptions.endpoints.length)}
                          {groupedOptions.endpoints.map((item, index) => (
                            <Box key={`endpoint-${index}`}>
                              {renderItem({ item })}
                            </Box>
                          ))}
                        </>
                      )}

                      {groupedOptions?.devices.length > 0 && (
                        <>
                          {renderSectionHeader('Devices', groupedOptions.devices.length)}
                          {groupedOptions.devices.map((item, index) => (
                            <Box key={`device-${index}`}>
                              {renderItem({ item })}
                            </Box>
                          ))}
                        </>
                      )}

                    </VStack>
                  )}
                </ScrollView>
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </FormControl>
  )
}

ClientSelect.propTypes = {
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object
  ]),
  onChange: PropTypes.func,
  onSubmitEditing: PropTypes.func,
  size: PropTypes.string,
  placeholder: PropTypes.string,
  isDisabled: PropTypes.bool,
  showPolicies: PropTypes.bool,
  showGroups: PropTypes.bool,
  showTags: PropTypes.bool,
  showEndpoints: PropTypes.bool,
  show_CIDR_Defaults: PropTypes.bool,
  label: PropTypes.string,
  helperText: PropTypes.string
}

ClientSelect.defaultProps = {
  showPolicies: false,
  showGroups: false,
  showTags: false,
  showEndpoints: false,
  show_CIDR_Defaults: false,
  isDisabled: false,
  placeholder: 'Select client'
}

export default ClientSelect
