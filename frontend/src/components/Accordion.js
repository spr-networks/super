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
  isOpen,
  onPress,
  ...props
}) => {
  const [showDescription, setShowDescription] = useState(false)
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setShowDescription(true)}
      onHoverOut={() => setShowDescription(false)}
    >
      <HStack
        bg="$muted50"
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
        borderBottomWidth="$1"
      >
        <HStack space="md" alignItems="center">
          <Icon size="xl" color="$primary600" as={icon || ArrowDownUpIcon} />
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
    <VStack display={isOpen ? 'flex' : 'none'} pb="$4">
      {props.renderItem ? (
        props.renderItem()
      ) : (
        <Text bold>{props.title || 'title'}</Text>
      )}
    </VStack>
  )
}

const Accordion = ({ items, ...props }) => {
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
        <VStack key={`alist:${item.label}`}>
          <AccordionHeader
            key={`aitem.${item.label}`}
            title={item.label}
            description={item.description}
            icon={item.icon}
            isOpen={open.includes(item.label)}
            onPress={() => handlePress(item.label)}
          />
          <AccordionContent
            key={`acontent.${item.label}`}
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
  open: PropTypes.array
}

export default Accordion

export { Accordion, AccordionContent, AccordionHeader }
