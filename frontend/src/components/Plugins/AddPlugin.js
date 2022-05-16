import React, { useContext, useState } from 'react'

import { pluginAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Button, FormControl, Input, Stack } from 'native-base'

const AddPlugin = (props) => {
  const contextType = useContext(AlertContext)

  const [Name, setName] = useState('')
  const [URI, setURI] = useState('')
  const [UnixPath, setUnixPath] = useState('')

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
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // TODO validate
    let plugin = { Name, URI, UnixPath }
    pluginAPI
      .add(plugin)
      .then((res) => {
        if (props.notifyChange) {
          props.notifyChange('plugin')
        }
      })
      .catch((err) => contextType.error(`API Error: ${err}`))
  }

  return (
    <Stack space={4}>
      <FormControl>
        <FormControl.Label>Name</FormControl.Label>

        <Input
          type="text"
          variant="underlined"
          name="Name"
          value={Name}
          onChangeText={(value) => handleChange('Name', value)}
          autoFocus
        />

        <FormControl.HelperText>
          Use a unique name to identify your plugin
        </FormControl.HelperText>
      </FormControl>
      <FormControl>
        <FormControl.Label>URI</FormControl.Label>

        <Input
          type="text"
          variant="underlined"
          name="URI"
          value={URI}
          onChangeText={(value) => handleChange('URI', value)}
          autoFocus
        />

        <FormControl.HelperText>
          {'Plugin will be @ "http://spr/plugins/' + (URI || 'URI') + '"'}
        </FormControl.HelperText>
      </FormControl>

      <FormControl>
        <FormControl.Label>UNIX Path</FormControl.Label>

        <Input
          type="text"
          variant="underlined"
          name="UnixPath"
          value={UnixPath}
          onChangeText={(value) => handleChange('UnixPath', value)}
          autoFocus
        />

        <FormControl.HelperText>
          Plugin pathname for unix socket
        </FormControl.HelperText>
      </FormControl>

      <Button color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

export default AddPlugin
