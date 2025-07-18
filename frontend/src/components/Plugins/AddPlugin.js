import React, { useContext, useState } from 'react'

import { pluginAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  VStack,
  HStack,
  Text
} from '@gluestack-ui/themed'

const AddPlugin = (props) => {
  const contextType = useContext(AlertContext)

  const [Name, setName] = useState('')
  const [URI, setURI] = useState('')
  const [UnixPath, setUnixPath] = useState('')
  const [ComposeFilePath, setComposeFilePath] = useState('')
  const [Enabled, setEnabled] = useState(true)
  const [GitURL, setGitURL] = useState('')
  const [HasUI, setHasUI] = useState(false)
  const [InstallTokenPath, setInstallTokenPath] = useState('')
  const [ScopedPaths, setScopedPaths] = useState('')

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
    if (name == 'GitURL') {
      setGitURL(value)
    }
    if (name == 'InstallTokenPath') {
      setInstallTokenPath(value)
    }
    if (name == 'ScopedPaths') {
      setScopedPaths(value)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // TODO validate
    // Convert ScopedPaths string to array
    const scopedPathsArray = ScopedPaths
      ? ScopedPaths.split(',').map(path => path.trim()).filter(path => path.length > 0)
      : []

    let plugin = { 
      Name, 
      URI, 
      UnixPath, 
      ComposeFilePath,
      Enabled,
      GitURL,
      HasUI,
      InstallTokenPath,
      ScopedPaths: scopedPathsArray
    }
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
            Docker Compose Filepath
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Git URL</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            value={GitURL}
            onChangeText={(value) => handleChange('GitURL', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Git repository URL for the plugin
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Install Token Path</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            value={InstallTokenPath}
            onChangeText={(value) => handleChange('InstallTokenPath', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Path to installation token file
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Scoped Paths</FormControlLabelText>
        </FormControlLabel>

        <Input variant="underlined">
          <InputField
            type="text"
            value={ScopedPaths}
            onChangeText={(value) => handleChange('ScopedPaths', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Comma-separated list of paths the plugin can access
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <Checkbox
          value={Enabled}
          onChange={setEnabled}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Enabled</CheckboxLabel>
        </Checkbox>

        <FormControlHelper>
          <FormControlHelperText>
            Enable plugin on creation
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <Checkbox
          value={HasUI}
          onChange={setHasUI}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Has UI</CheckboxLabel>
        </Checkbox>

        <FormControlHelper>
          <FormControlHelperText>
            Plugin provides a user interface
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
