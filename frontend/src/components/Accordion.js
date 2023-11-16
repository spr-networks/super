import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { HStack, Icon, Pressable, Text, VStack } from '@gluestack-ui/themed'
import {
  ArrowDownUpIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from 'lucide-react-native'

const AccordionHeader = ({
  title,
  description,
  icon,
  colorIcon,
  showDescription: _showDescription,
  isOpen,
  onPress,
  ...props
}) => {
  const [showDescription, setShowDescription] = useState(
    _showDescription || false
  )
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setShowDescription(_showDescription || true)}
      onHoverOut={() => setShowDescription(_showDescription || false)}
    >
      <HStack
        bg="$muted50"
        borderBottomWidth="$1"
        borderColor="$muted200"
        sx={{
          _dark: {
            bg: '$backgroundContentDark',
            borderColor: '$borderColorCardDark'
          }
        }}
        px="$4"
        py="$6"
        justifyContent="space-between"
      >
        <HStack space="md" alignItems="center">
          <Icon
            size="xl"
            color={colorIcon || '$primary600'}
            as={icon || ArrowDownUpIcon}
          />
          <Text size="md">{title}</Text>
          {description && showDescription ? (
            <Text size="sm" color="$muted500">
              {description}
            </Text>
          ) : null}
        </HStack>
        <Icon as={isOpen ? ChevronUpIcon : ChevronDownIcon} />
      </HStack>
    </Pressable>
  )
}

const AccordionContent = ({ isOpen, ...props }) => {
  return (
    <VStack
      display={isOpen ? 'flex' : 'none'}
      borderBottomWidth="$1"
      borderColor="$muted200"
      sx={{
        _dark: {
          bg: '$backgroundContentDark',
          borderColor: '$borderColorCardDark'
        }
      }}
    >
      {props.renderItem ? (
        props.renderItem()
      ) : (
        <Text bold>{props.title || 'title'}</Text>
      )}
    </VStack>
  )
}

const Accordion = ({ items, showDescription, ...props }) => {
  const [open, setOpen] = useState(props.open || [])

  const handlePress = (label) => {
    if (open.includes(label)) {
      setOpen(open.filter((l) => l != label))
    } else {
      setOpen([...open, label])
    }
  }

  useEffect(() => {
    setOpen(props.open)
  }, [props.open])

  return (
    <VStack>
      {items.map((item) => (
        <VStack key={`alist:${item.label}.${open.includes(item.label)}`}>
          <AccordionHeader
            title={item.label}
            description={item.description}
            icon={item.icon}
            colorIcon={item.colorIcon}
            showDescription={showDescription}
            isOpen={open.includes(item.label)}
            onPress={() => handlePress(item.label)}
          />
          <AccordionContent
            title={item.label}
            renderItem={item.renderItem}
            isOpen={open.includes(item.label)}
          />
        </VStack>
      ))}
    </VStack>
  )
}

Accordion.propTypes = {
  items: PropTypes.array,
  open: PropTypes.array,
  showDescription: PropTypes.bool
}

export default Accordion

export { Accordion, AccordionContent, AccordionHeader }
