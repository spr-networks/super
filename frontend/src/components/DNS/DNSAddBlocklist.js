import React from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Link,
  LinkText,
  HStack,
  Spinner,
  Text,
  VStack
} from '@gluestack-ui/themed'

export default class DNSAddBlocklist extends React.Component {
  state = { URI: '', Enabled: true, pending: false }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSwitchChange = this.handleSwitchChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(value) {
    this.setState({ URI: value })
  }

  handleSwitchChange(el, Enabled) {
    this.setState({ Enabled })
  }

  handleSubmit() {
    let blocklist = { URI: this.state.URI, Enabled: this.state.Enabled }

    this.setState({ pending: true })

    blockAPI
      .putBlocklist(blocklist)
      .then(() => {
        this.setState({ pending: false })
        this.props.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })

    setTimeout(() => {
      // can take some time - close modal
      if (this.state.pending) {
        this.props.notifyChange('blocklists')
      }
    }, 5000)
  }

  render() {
    if (this.state.pending) {
      return (
        <HStack space={1}>
          <Spinner accessibilityLabel="Loading posts" />
          <Text>Updating blocklists...</Text>
        </HStack>
      )
    }

    return (
      <VStack space="lg">
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>URI</FormControlLabelText>
          </FormControlLabel>

          <VStack space="sm">
            <Input variant="underlined">
              <InputField
                type="text"
                placeholder="https://..."
                name="URI"
                value={this.state.URI}
                onSubmitEditing={this.handleSubmit}
                onChangeText={this.handleChange}
                autoFocus
              />
            </Input>
            <HStack space="sm" flexWrap="wrap">
              <Link
                color="$muted500"
                isExternal
                href="https://github.com/StevenBlack/hosts"
              >
                <LinkText size="sm">See here</LinkText>
              </Link>
              <Link
                color="$muted500"
                isExternal
                href="https://github.com/blocklistproject/Lists"
              >
                <LinkText size="sm">and here</LinkText>
              </Link>
              <Text size="sm" color="$muted500">
                for examples of host files to use
              </Text>
            </HStack>
          </VStack>
        </FormControl>

        <Checkbox
          accessibilityLabel="Enabled"
          value={this.state.Enabled}
          isChecked={this.state.Enabled}
          onChange={(enabled) =>
            this.handleSwitchChange(this, !this.state.Enabled)
          }
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Enabled</CheckboxLabel>
        </Checkbox>

        <Button
          variant="solid"
          colorScheme="primary"
          onPress={this.handleSubmit}
        >
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

DNSAddBlocklist.propTypes = {
  notifyChange: PropTypes.func
}

DNSAddBlocklist.contextType = AlertContext
