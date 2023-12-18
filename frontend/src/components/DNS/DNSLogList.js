import React, { useContext, useEffect, useState } from 'react'

import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'

import { deviceAPI } from 'api'
import { logAPI } from 'api/DNS'
import ModalConfirm from 'components/ModalConfirm'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  VStack,
  Text,
  CloseIcon,
  AddIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

const DNSLogList = ({ title, description, ...props }) => {
  const context = useContext(AlertContext)
  const [type, setType] = useState(props.type)
  const [list, setList] = useState([])
  const [ipNames, setIpNames] = useState({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    refreshBlocklists()
  }, [])

  const ip_to_name = (ip) => {
    if (ipNames[ip]) {
      return ipNames[ip]
    }
    return ip
  }

  const cleanIp = (ip) => ip.replace(/\/.*/, '') // remove subnet

  const refreshBlocklists = async () => {
    try {
      let list = []
      if (type == 'Domain') {
        list = await logAPI.domainIgnores()
      } else {
        list = await logAPI.hostPrivacyList()

        let devices = await deviceAPI.list()
        let options = Object.values(devices)
        let name_map = {}
        for (let ident in devices) {
          let d = devices[ident]
          let key_ip = cleanIp(d.RecentIP)
          let name_value = d.Name || d.RecentIP
          name_map[key_ip] = name_value
        }
        setIpNames(name_map)
      }

      setList(list)
    } catch (error) {
      context.error('API Failure: ' + error.message)
    }
  }

  const addListItem = (item) => {
    let newList = [...new Set([...list, item])]
    setList(newList)

    if (type == 'Domain') {
      logAPI.putDomainIgnore(newList)
    } else {
      logAPI.putHostPrivacyList(newList)
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
    setIsModalOpen(false)
    if (value.length == 0) {
      return
    }

    //append trailing dot
    if (type == 'Domain' && !value.endsWith('.')) {
      value = value + '.'
    }

    addListItem(value)
  }

  const triggerAdd = (triggerProps) => {
    return (
      <Button {...triggerProps} size="xs" variant="solid" action="primary">
        <ButtonText>{'Add ' + type}</ButtonText>
        <ButtonIcon as={AddIcon} ml="$1" />
      </Button>
    )
  }

  return (
    <>
      <ListHeader title={title} description={description}>
        <ModalConfirm
          type={type}
          onSubmit={handleSubmit}
          trigger={triggerAdd}
          isOpen={isModalOpen}
        />
      </ListHeader>

      <Box px="$4" mb="$4">
        {!list.length ? (
          <VStack space="md">
            <Text alignSelf={'center'}>List is empty</Text>
            <Button
              action="secondary"
              variant="solid"
              onPress={() => setIsModalOpen(true)}
            >
              <ButtonText>{`Add ${title.replace(/ List$/, '')}`}</ButtonText>
              <ButtonIcon as={AddIcon} ml="$1" />
            </Button>
          </VStack>
        ) : null}
        <FlatList
          data={list}
          keyExtractor={(item, index) => index}
          estimatedItemSize={100}
          renderItem={({ item }) => (
            <ListItem>
              <Text>{item}</Text>
              {type == 'IP' ? <Text> {ip_to_name(item)}</Text> : null}
              <Button
                size="sm"
                action="secondary"
                variant="link"
                onPress={() => deleteListItem(item)}
                marginLeft="auto"
              >
                <ButtonIcon as={CloseIcon} color="$red700" />
              </Button>
            </ListItem>
          )}
        />
      </Box>
    </>
  )
}

DNSLogList.propTypes = {
  type: PropTypes.string.isRequired,
  title: PropTypes.string,
  description: PropTypes.string
}

export default DNSLogList
