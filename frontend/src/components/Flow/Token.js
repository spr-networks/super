import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Icon,
  Input,
  InputField,
  HStack,
  Tooltip,
  TooltipContent,
  TooltipText,
  Popover,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
  PopoverCloseButton,
  PopoverHeader,
  CloseIcon,
  Heading,
  Text
} from '@gluestack-ui/themed'

import { Menu } from 'components/Menu'

import TimeSelect from '../TimeSelect'
import InputSelect from 'components/InputSelect'
import ClientSelect from 'components/ClientSelect'

import { niceDateToArray, dateArrayToStr, flowObjParse } from './Utils'

// token is like variables but for cards
const Token = ({
  label,
  value: defaultValue,
  format,
  description,
  onChange,
  ...props
}) => {
  const [value, setValue] = useState('' + defaultValue)
  const [isOpen, setIsOpen] = useState(false)

  let size = props.size || 'xs'
  let options = props.options || [] // for autocomplete

  const tokenProps = {
    action: 'secondary',
    variant: 'outline',
    size: 'xs',
    p: '$1',
    px: '$2'
  }

  const displayValue = (value, label) => {
    if (label == 'days') {
      return dateArrayToStr(value)
    }

    if (Array.isArray(value)) {
      return value.join(',')
    }

    if (value == '') {
      if (['Tags', 'Groups'].includes(label)) {
        return `Select ${label}`
      }

      return '*'
    }
    let ret = flowObjParse(value)
    return ret
  }

  // TODO autocomplete for selecting values:
  // groups, clients, ports

  const onChangeText = (value) => {
    //only update if correct format
    if (format !== undefined && !value.match(format)) {
      return
    }

    setValue(value)
    if (onChange) {
      onChange(value)
    }
  }

  // dropdown menu with select multiple
  // TODO if param is PropType.array
  if (['days'].includes(label)) {
    let defaultValue = label == 'days' ? niceDateToArray(value) : value
    let title = `Select ${label}`
    let isMultiple = true
    let inputType = isMultiple ? 'checkbox' : 'radio'

    const handleChange = (values) => {
      if (label == 'days') {
        onChangeText(dateArrayToStr(values))
      } else {
        onChangeText(values)
      }
    }

    // skip popover & use the menu directly
    // triggers differ slightly
    //<Tooltip label={label}></Tooltip>
    const trigger = (triggerProps) => (
      <Button {...tokenProps} {...triggerProps}>
        <ButtonText>{displayValue(value, label)}</ButtonText>
      </Button>
    )

    /*const trigger = (triggerProps) => (
      <Tooltip
        placement="bottom"
        trigger={(triggerPropsTooltip) => {
          return (
            <Button {...tokenProps} {...triggerProps} {...triggerPropsTooltip}>
              <ButtonText>{displayValue(value, label)}</ButtonText>
            </Button>
          )
        }}
      >
        <TooltipContent>
          <TooltipText>{label}</TooltipText>
        </TooltipContent>
      </Tooltip>
    )*/

    return (
      <Menu w="190" closeOnSelect={!isMultiple} trigger={trigger}>
        <Menu.OptionGroup
          defaultValue={defaultValue}
          type={inputType}
          title={title}
          onChange={handleChange}
        >
          {options.map((item) => (
            <Menu.ItemOption key={item.value} value={item.value}>
              {item.label}
            </Menu.ItemOption>
          ))}
        </Menu.OptionGroup>
      </Menu>
    )
  }

  let inputElement = (
    <Input variant="outlined">
      <InputField
        defaultValue={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    </Input>
  )

  // time picker
  if (['from', 'to'].includes(label)) {
    const onSelect = (value) => {
      onChangeText(value)
      if (isOpen) {
        //setIsOpen(false) // TODO FIX initial trigger
      }
    }

    inputElement = <TimeSelect value={value} onChange={onSelect} />
  } else if (label == 'Client') {
    inputElement = (
      <ClientSelect
        showGroups
        showTags
        value={value}
        onChange={(value) => {
          onChangeText(value)
          setIsOpen(false)
        }}
      />
    )
  } /* else if (['DstPort', 'SrcPort'].includes(label)) {
    const onSelect = (value) => {
      onChangeText(value)
      setIsOpen(false)
    }

    inputElement = (
      <InputSelect
        options={options}
        value={value}
        onChange={onSelect}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    )
  }*/ else if (
    (['Tags', 'Groups', 'DstInterface', 'Container', 'OriginalDstIP'].includes(
      label
    ) ||
      label.endsWith('Port')) &&
    options
  ) {
    // TODO menu
    // TODO props.options && isMultiple= value == array
    const onSelect = (values) => {
      onChangeText(values)
      setIsOpen(false)
    }

    let isDisabled = false
    let isMultiple = ['Tags', 'Groups'].includes(label)
    inputElement = (
      <InputSelect
        isDisabled={isDisabled}
        isMultiple={isMultiple}
        options={options}
        value={value}
        onChange={onSelect}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    )
  }

  //NOTE treat empty value as *
  /*const trigger = (triggerProps) => (
    <TooltipNB label={label}>
      <Button
        {...tokenProps}
        {...triggerProps}
        onPress={() => setIsOpen(!isOpen)}
      >
        <ButtonText>{displayValue(value)}</ButtonText>
      </Button>
    </TooltipNB>
  )*/

  const trigger = (triggerProps) => (
    <Tooltip
      placement="bottom"
      trigger={(triggerPropsTooltip) => {
        return (
          <Button
            {...tokenProps}
            {...triggerProps}
            {...triggerPropsTooltip}
            onPress={() => setIsOpen(!isOpen)}
          >
            <ButtonText>{displayValue(value)}</ButtonText>
          </Button>
        )
      }}
    >
      <TooltipContent>
        <TooltipText>{label}</TooltipText>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <>
      <Popover
        placement="bottom"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
      >
        <PopoverBackdrop />
        <PopoverContent minW={180}>
          <PopoverHeader>
            <Heading size="sm">{label}</Heading>
            <PopoverCloseButton>
              <Icon as={CloseIcon} />
            </PopoverCloseButton>
          </PopoverHeader>
          <PopoverBody>
            <HStack space="md">
              <FormControl flex={1}>
                {/*<FormControlLabel>
                  <FormControlLabelText>{label}</FormControlLabelText>
                </FormControlLabel>*/}

                {inputElement}
                <FormControlHelper>
                  <FormControlHelperText>{description}</FormControlHelperText>
                </FormControlHelper>
              </FormControl>
              {/*<IconButton
                ml="auto"
                colorScheme="light"
                icon={<Icon icon={faTag} />}
              />*/}
            </HStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  )
}

Token.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  format: PropTypes.any, //instanceOf(RegExp),
  description: PropTypes.string,
  onChange: PropTypes.func
}

export default Token
