import React, { useContext, useState } from 'react'

import { pluginAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  VStack
} from '@gluestack-ui/themed'

const AddPlugin = (props) => {
  const contextType = useContext(AlertContext)

  const [Name, setName] = useState('')
  const [URI, setURI] = useState('')
  const [UnixPath, setUnixPath] = useState('')
  const [ComposeFilePath, setComposeFilePath] = useState('')

  const handleChange = (name, value) => {
    if (name == 'Name') {
      setName(value)
    }
    if (name == 'URI') {
      setURI(value)
    }
    if (name == 'UnixPath') {
      setUnixPath(value)
    }
    if (name == 'ComposeFilePath') {
      setComposeFilePath(value)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // TODO validate
    let plugin = { Name, URI, UnixPath, ComposeFilePath }
    pluginAPI
      .add(plugin)
      .then((res) => {
        if (props.notifyChange) {
          props.notifyChange('plugin')
        }
      })
      .catch((err) => {
        contextType.error(`XX API Error:`, err)
      })
  }

  return (
    <VStack space="md">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            name="Name"
            value={Name}
            autoFocus
            onChangeText={(value) => handleChange('Name', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Use a unique name to identify your plugin
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>URI</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            name="URI"
            value={URI}
            onChangeText={(value) => handleChange('URI', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            {'Plugin will be @ "http://spr/plugins/' + (URI || 'URI') + '"'}
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>UNIX Path</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            value={UnixPath}
            onChangeText={(value) => handleChange('UnixPath', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Plugin pathname for unix socket
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>ComposeFilePath</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            value={ComposeFilePath}
            onChangeText={(value) => handleChange('ComposeFilePath', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Plugin pathname for unix socket
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <Button action="primary" size="md" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

export default AddPlugin
