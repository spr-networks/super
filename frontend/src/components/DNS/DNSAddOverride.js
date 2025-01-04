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
  HStack,
  RadioGroup,
  Radio,
  RadioIndicator,
  RadioIcon,
  RadioLabel,
  CircleIcon
} from '@gluestack-ui/themed'

export default class DNSAddOverride extends React.Component {
  state = {
    Type: '',
    ReturnType: 'IP',
    Domain: '',
    ResultIP: '',
    ResultCNAME: '',
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

    this.state.listName = props.listName || 'Default'
    this.state.Type = props.type
    this.state.Domain = props.domain || ''
    this.state.ResultIP = props.ResultIP || ''
    this.state.ResultCNAME = props.ResultCNAME || ''
    this.state.ClientIP = props.clientip || '*'
    this.state.check = {
      Type: '',
      Domain: '',
      ResultIP: '',
      ResultCNAME: '',
      ClientIP: ''
    }

    this.handleChange = this.handleChange.bind(this)
    this.validateField = this.validateField.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  validateField(name, value) {
    let check = {
      Type: '',
      Domain: '',
      ResultIP: '',
      ResultCNAME: '',
      ClientIP: ''
    }

    if (name == 'Type' && !['block', 'permit'].includes(value)) {
      check.Type = 'has-danger'
    }

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

    if (this.state.ReturnType == 'CNAME') {
      if (
        this.state.ResultCNAME != '' &&
        !this.state.ResultCNAME.endsWith('.')
      ) {
        this.state.ResultCNAME += '.'
      }
      this.state.ResultIP = ''
    } else if (this.state.ReturnType == 'IP') {
      this.state.ResultCNAME = ''
    }

    let override = {
      Type: this.state.Type,
      Domain: this.state.Domain,
      ResultIP: this.state.ResultIP,
      ResultCNAME: this.state.ResultCNAME,
      ClientIP: this.state.ClientIP,
      Expiration: this.state.Expiration
    }

    if (!override.Domain.endsWith('.')) {
      override.Domain += '.'
    }

    blockAPI
      .putOverride(this.state.listName, override)
      .then(() => {
        this.props.notifyChange(this.state.Type)
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  render() {
    return (
      <VStack space="md">
        <FormControlLabel>
          <FormControlLabelText>
            List name: {this.state.listName}
          </FormControlLabelText>
        </FormControlLabel>
        <FormControl isInvalid={this.state.check.Type == 'has-danger'}>
          <FormControlLabel>
            <FormControlLabelText>Type of override</FormControlLabelText>
          </FormControlLabel>

          <RadioGroup
            flex={1}
            defaultValue={this.state.Type}
            accessibilityLabel="Select Type"
            onChange={(type) => {
              this.handleChange('Type', type)
            }}
          >
            <HStack py="1" space="md">
              <Radio key="block" value="block" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>Block</RadioLabel>
              </Radio>

              <Radio key="permit" value="permit" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>Permit</RadioLabel>
              </Radio>
            </HStack>
          </RadioGroup>
          {this.state.check.Type == 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>Invalid Block Type</FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                {this.state.Type == 'block'
                  ? 'Block custom domain lookups'
                  : 'Override/Allow DNS lookup'}
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

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
                Trailing dot to avoid prefix matching
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

        <FormControl
          isInvalid={
            this.state.check.ResultIP == 'has-danger' ||
            this.state.check.ReturnCNAME == 'has-danger'
          }
        >
          <FormControlLabel>
            <FormControlLabelText>Result Type</FormControlLabelText>
          </FormControlLabel>

          <RadioGroup
            flex={1}
            defaultValue={this.state.ReturnType}
            accessibilityLabel="Select Return Type"
            onChange={(type) => {
              this.handleChange('ReturnType', type)
            }}
          >
            <HStack py="1" space="md">
              <Radio key="block" value="IP" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>IP</RadioLabel>
              </Radio>

              <Radio key="permit" value="CNAME" size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel>CNAME</RadioLabel>
              </Radio>
            </HStack>
          </RadioGroup>

          <Input py="1">
            <InputField
              type="text"
              name="ResultIP"
              value={
                this.state.ReturnType == 'IP'
                  ? this.state.ResultIP
                  : this.state.ResultCNAME
              }
              onChangeText={(value) =>
                this.handleChange('Result' + this.state.ReturnType, value)
              }
            />
          </Input>

          {this.state.check.ResultIP == 'has-danger' ||
          this.state.check.ResultCNAME == 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>
                Please enter a valid {this.state.ReturnType} or leave empty
              </FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                Optional. Set a custom {this.state.ReturnType} address to return
                for domain name lookup
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
            onChangeText={(value) => this.handleChange('ClientIP', value)}
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
  listName: PropTypes.string,
  domain: PropTypes.string,
  clientip: PropTypes.string,
  notifyChange: PropTypes.func
}

DNSAddOverride.contextType = AlertContext
