import React from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Input,
  Link,
  Stack,
  HStack,
  Spinner,
  Text
} from 'native-base'

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
      <Box>
        <Stack space={2}>
          <FormControl.Label>URI</FormControl.Label>

          <Stack space={2}>
            <Input
              type="text"
              placeholder="https://..."
              name="URI"
              value={this.state.URI}
              onSubmitEditing={this.handleSubmit}
              onChangeText={this.handleChange}
              autoFocus
            />
            <HStack space={1}>
              <Link
                color="muted.500"
                isExternal
                href="https://github.com/StevenBlack/hosts"
              >
                See here
              </Link>
              <Link
                color="muted.500"
                isExternal
                href="https://github.com/blocklistproject/Lists"
              >
                and here
              </Link>
              <Text color="muted.500">for examples of host files to use</Text>
            </HStack>
          </Stack>

          {/*<FormControl.Label>Enabled</FormControl.Label>*/}
          <Checkbox
            accessibilityLabel="Enabled"
            colorScheme="green"
            value={this.state.Enabled}
            isChecked={this.state.Enabled}
            onChange={(enabled) =>
              this.handleSwitchChange(this, !this.state.Enabled)
            }
          >
            Enabled
          </Checkbox>

          <Button
            mt={2}
            variant="solid"
            colorScheme="primary"
            onPress={this.handleSubmit}
          >
            Save
          </Button>
        </Stack>
      </Box>
    )
  }
}

DNSAddBlocklist.propTypes = {
  notifyChange: PropTypes.func
}

DNSAddBlocklist.contextType = AlertContext
