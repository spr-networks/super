import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { APIErrorContext } from 'layouts/Admin'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'

import { logAPI } from 'api/DNS'
import ModalConfirm from 'components/ModalConfirm'

import {
  Box,
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

import { Table } from 'reactstrap'

export default class DNSLogList extends React.Component {
  static contextType = APIErrorContext
  state = { type: '', list: [] }

  constructor(props) {
    super(props)

    this.deleteListItem = this.deleteListItem.bind(this)
    this.addListItem = this.addListItem.bind(this)

    this.state.list = []
    this.state.type = props.type

    this.refModal = React.createRef()
  }

  async componentDidMount() {
    this.refreshBlocklists()
  }

  async refreshBlocklists() {
    try {
      let list = []
      if (this.state.type == 'Domain') {
        list = await logAPI.domainIgnores()
      } else {
        list = await logAPI.hostPrivacyList()
      }

      this.setState({ list })
    } catch (error) {
      this.context.reportError('API Failure: ' + error.message)
    }
  }

  addListItem(item) {
    let list = this.state.list
    list.push(item)
    this.setState({ list })
    if (this.state.type == 'Domain') {
      logAPI.putDomainIgnore(item)
    } else {
      logAPI.putHostPrivacyList(list)
    }
  }

  deleteListItem(item) {
    if (this.state.type == 'Domain') {
      logAPI.deleteDomainIgnore(item).then((res) => {
        let list = this.state.list.filter((_item) => _item != item)
        this.setState({ list })
      })
    } else {
      let list = this.state.list.filter((_item) => _item != item)
      logAPI
        .putHostPrivacyList(list)
        .then((res) => {
          this.setState({ list })
        })
        .catch((error) => {
          this.context.reportError('API Failure: ' + error.message)
        })
    }
  }

  render() {
    let type = this.state.type
    let list = this.state.list

    const handleSubmit = (value) => {
      this.addListItem(value)
    }

    /*TODO:useColorModeValue('warmGray.50', 'blueGray.800')*/
    return (
      <Box
        _light={{ bg: 'warmGray.50' }}
        _dark={{ bg: 'blueGray.800' }}
        rounded="md"
        width="100%"
        p="4"
        mb="4"
      >
        <HStack alignItems="center">
          <VStack>
            <Heading>{this.props.title}</Heading>
            <Text color="muted.500">{this.props.description}</Text>
          </VStack>

          <ModalConfirm
            marginLeft="auto"
            type={type}
            handleSubmit={handleSubmit}
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
                  onPress={() => this.deleteListItem(item)}
                  marginLeft="auto"
                />
              </HStack>
            ))}
          </>
        ) : null}
      </Box>
    )
  }
}

DNSLogList.propTypes = {
  type: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string
}
