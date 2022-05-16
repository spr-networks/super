import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faTimes } from '@fortawesome/free-solid-svg-icons'

import { logAPI } from 'api/DNS'
import ModalConfirm from 'components/ModalConfirm'

import {
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

const DNSLogList = ({ title, description, ...props }) => {
  const context = useContext(AlertContext)
  const [type, setType] = useState(props.type)
  const [list, setList] = useState([])

  const refModal = React.createRef()

  useEffect(() => {
    refreshBlocklists()
  }, [])

  const refreshBlocklists = async () => {
    try {
      let list = []
      if (type == 'Domain') {
        list = await logAPI.domainIgnores()
      } else {
        list = await logAPI.hostPrivacyList()
      }

      setList(list)
    } catch (error) {
      context.error('API Failure: ' + error.message)
    }
  }

  const addListItem = (item) => {
    setList(list.concat(item))

    if (type == 'Domain') {
      logAPI.putDomainIgnore(item)
    } else {
      logAPI.putHostPrivacyList(list)
    }
  }

  const deleteListItem = (item) => {
    if (type == 'Domain') {
      logAPI.deleteDomainIgnore(item).then((res) => {
        let listNew = list.filter((_item) => _item != item)
        setList(listNew)
      })
    } else {
      let listNew = list.filter((_item) => _item != item)
      logAPI
        .putHostPrivacyList(listNew)
        .then((res) => {
          setList(listNew)
        })
        .catch((error) => {
          context.error('API Failure: ' + error.message)
        })
    }
  }

  const handleSubmit = (value) => {
    addListItem(value)
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
      mb="4"
    >
      <HStack alignItems="center">
        <VStack>
          <Heading fontSize="xl">{title}</Heading>
          <Text color="muted.500">{description}</Text>
        </VStack>

        <ModalConfirm
          type={type}
          onSubmit={handleSubmit}
          trigger={(triggerProps) => {
            return (
              <Button {...triggerProps} marginLeft="auto">
                {'Add ' + type}
              </Button>
            )
          }}
        />
      </HStack>

      {list.length ? (
        <>
          <HStack py="4">
            <Text color="primary.400" bold>
              {type}
            </Text>
            <Text color="primary.400" bold marginLeft="auto">
              Actions
            </Text>
          </HStack>
          <Divider />

          {list.map((item) => (
            <HStack
              key={item}
              py="4"
              borderBottomWidth={1}
              _light={{ borderBottomColor: 'muted.200' }}
              _dark={{ borderBottomColor: 'muted.600' }}
            >
              <Text>{item}</Text>

              <IconButton
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon as={FontAwesomeIcon} icon={faTimes} />}
                size="sm"
                onPress={() => deleteListItem(item)}
                marginLeft="auto"
              />
            </HStack>
          ))}
        </>
      ) : null}
    </Box>
  )
}

DNSLogList.propTypes = {
  type: PropTypes.string.isRequired,
  title: PropTypes.string,
  description: PropTypes.string
}

export default DNSLogList
