import React from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import ClientSelect from 'components/ClientSelect'
import { format as timeAgo } from 'timeago.js'
import InputSelect from 'components/InputSelect'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  VStack,
  Text
} from '@gluestack-ui/themed'

export default class DNSAddOverride extends React.Component {
  state = {
    Type: '',
    Domain: '',
    ResultIP: '0.0.0.0',
    ClientIP: '*',
    Expiration: 0,
    check: {}
  }

  expirationOptions = [
    { label: 'Never', value: 0 },
    { label: '5 Minutes', value: 60 * 5 },
    { label: '30 Minutes', value: 60 * 30 },
    { label: '1 Hour', value: 60 * 60 },
    { label: '1 Day', value: 60 * 60 * 24 },
    { label: '1 Week', value: 60 * 60 * 24 * 7 }
  ]

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
      <VStack space="md">
        <FormControl
          isRequired
          isInvalid={this.state.check.Domain == 'has-danger'}
        >
          <FormControlLabel>
            <FormControlLabelText>Domain</FormControlLabelText>
          </FormControlLabel>

          <Input size="md" variant="underlined">
            <InputField
              type="text"
              name="Domain"
              value={this.state.Domain}
              onChangeText={(value) => this.handleChange('Domain', value)}
              onSubmitEditing={this.handleSubmit}
              autoFocus
            />
          </Input>
          {this.state.check.Domain == 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>Specify a domain name</FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                Trailing dot for domain name is to avoid prefix matching
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

        <FormControl isInvalid={this.state.check.ResultIP == 'has-danger'}>
          <FormControlLabel>
            <FormControlLabelText>Result IP</FormControlLabelText>
          </FormControlLabel>

          <Input variant="underlined">
            <InputField
              type="text"
              name="ResultIP"
              value={this.state.ResultIP}
              onChangeText={(value) => this.handleChange('ResultIP', value)}
            />
          </Input>

          {this.state.check.ResultIP == 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>
                Please enter a valid IP or leave empty
              </FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                Optional. Set a custom IP address to return for domain name
                lookup
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

        <FormControl isInvalid={this.state.check.ClientIP == 'has-danger'}>
          <FormControlLabel>
            <FormControlLabelText>Client IP</FormControlLabelText>
          </FormControlLabel>

          <ClientSelect
            value={this.state.ClientIP}
            onChange={(value) => this.handleChange('ClientIP', value)}
          />

          {this.state.check.ClientIP == 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>
                Please enter a valid IP or *
              </FormControlErrorText>
            </FormControlError>
          ) : null}
          <FormControlHelper>
            <FormControlHelperText>
              Optional. Set a Client IP this rule is applied to
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Expiration</FormControlLabelText>
          </FormControlLabel>

          <InputSelect
            options={this.expirationOptions}
            value={
              this.state.Expiration
                ? timeAgo(new Date(Date.now() + this.state.Expiration * 1e3))
                : 'Never'
            }
            onChange={(v) => this.handleChange('Expiration', parseInt(v))}
            onChangeText={(v) => this.handleChange('Expiration', parseInt(v))}
          />

          <FormControlHelper>
            <FormControlHelperText>
              If non zero has unix time for when the entry should disappear
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <Button action="primary" variant="solid" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
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
