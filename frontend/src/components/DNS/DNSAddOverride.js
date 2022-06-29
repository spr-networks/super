import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import ClientSelect from 'components/ClientSelect'

import { Button, FormControl, Input, VStack } from 'native-base'

export default class DNSAddOverride extends React.Component {
  state = {
    Type: '',
    Domain: '',
    ResultIP: '0.0.0.0',
    ClientIP: '*',
    Expiration: 0,
    check: {}
  }

  constructor(props) {
    super(props)

    this.state.Type = props.type
    this.state.Domain = props.domain || ''
    this.state.ResultIP = props.ResultIP || ''
    this.state.ClientIP = props.clientip || '*'
    this.state.check = {
      Domain: '',
      ResultIP: '',
      ClientIP: ''
    }

    this.handleChange = this.handleChange.bind(this)
    this.validateField = this.validateField.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  validateField(name, value) {
    let check = { Domain: '', ResultIP: '', ClientIP: '' }

    if (name == 'Domain' && !value.length) {
      check.Domain = 'has-danger'
    }

    if (
      name.match(/^(Result|Client)IP$/) &&
      value != '*' &&
      value.length &&
      !value.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)
    ) {
      check[name] = 'has-danger'
    }

    this.setState({ check })
  }

  handleChange(name, value) {
    this.validateField(name, value)
    this.setState({ [name]: value })
  }

  handleSubmit() {
    const isValid = () => {
      return Object.values(this.state.check).filter((v) => v.length).length == 0
    }

    if (!isValid()) {
      return
    }

    let override = {
      Type: this.state.Type,
      Domain: this.state.Domain,
      ResultIP: this.state.ResultIP,
      ClientIP: this.state.ClientIP,
      Expiration: this.state.Expiration
    }

    if (!override.Domain.endsWith('.')) {
      override.Domain += '.'
    }

    blockAPI
      .putOverride(override)
      .then(() => {
        this.props.notifyChange('override')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  render() {
    return (
      <VStack space={2}>
        <FormControl
          isRequired
          isInvalid={this.state.check.Domain == 'has-danger'}
        >
          <FormControl.Label>Domain</FormControl.Label>

          <Input
            type="text"
            name="Domain"
            value={this.state.Domain}
            onChangeText={(value) => this.handleChange('Domain', value)}
            onSubmitEditing={this.handleSubmit}
            autoFocus
          />
          {this.state.check.Domain == 'has-danger' ? (
            <FormControl.ErrorMessage>
              Specify a domain name
            </FormControl.ErrorMessage>
          ) : null}
        </FormControl>

        <FormControl isInvalid={this.state.check.ResultIP == 'has-danger'}>
          <FormControl.Label>Result IP</FormControl.Label>

          <Input
            type="text"
            name="ResultIP"
            value={this.state.ResultIP}
            onChangeText={(value) => this.handleChange('ResultIP', value)}
          />

          {this.state.check.ResultIP == 'has-danger' ? (
            <FormControl.ErrorMessage>
              Please enter a valid IP or leave empty
            </FormControl.ErrorMessage>
          ) : (
            <FormControl.HelperText>
              Optional. Set a custom IP address to return for domain name lookup
            </FormControl.HelperText>
          )}
        </FormControl>

        <FormControl isInvalid={this.state.check.ClientIP == 'has-danger'}>
          <FormControl.Label>Client IP</FormControl.Label>

          <ClientSelect
            value={this.state.ClientIP}
            onChange={(value) => this.handleChange('ClientIP', value)}
          />

          {this.state.check.ClientIP == 'has-danger' ? (
            <FormControl.ErrorMessage>
              Please enter a valid IP or *
            </FormControl.ErrorMessage>
          ) : null}
          <FormControl.HelperText>
            Optional. Set a Client IP this rule is applied to
          </FormControl.HelperText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Expiration</FormControl.Label>

          <Input
            type="number"
            name="Expiration"
            value={this.state.Expiration}
            onChangeText={(value) =>
              this.handleChange('Expiration', parseInt(value))
            }
          />

          <FormControl.HelperText>
            If non zero has unix time for when the entry should disappear
          </FormControl.HelperText>
        </FormControl>

        <Button
          mt={2}
          variant="solid"
          colorScheme="primary"
          onPress={this.handleSubmit}
        >
          Save
        </Button>
      </VStack>
    )
  }
}

DNSAddOverride.propTypes = {
  type: PropTypes.string,
  domain: PropTypes.string,
  clientip: PropTypes.string,
  notifyChange: PropTypes.func
}

DNSAddOverride.contextType = AlertContext
