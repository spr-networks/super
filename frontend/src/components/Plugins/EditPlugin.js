import React, { useContext, useState, useEffect } from 'react'

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

const EditPlugin = ({ plugin, onClose, notifyChange, ...props }) => {
  const contextType = useContext(AlertContext)

  const [Name, setName] = useState(plugin.Name || '')
  const [URI, setURI] = useState(plugin.URI || '')
  const [UnixPath, setUnixPath] = useState(plugin.UnixPath || '')
  const [ComposeFilePath, setComposeFilePath] = useState(plugin.ComposeFilePath || '')
  const [Enabled, setEnabled] = useState(plugin.Enabled || false)
  const [GitURL, setGitURL] = useState(plugin.GitURL || '')
  const [HasUI, setHasUI] = useState(plugin.HasUI || false)
  const [InstallTokenPath, setInstallTokenPath] = useState(plugin.InstallTokenPath || '')
  const [ScopedPaths, setScopedPaths] = useState(plugin.ScopedPaths ? plugin.ScopedPaths.join(', ') : '')

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

    // Convert ScopedPaths string to array
    const scopedPathsArray = ScopedPaths
      ? ScopedPaths.split(',').map(path => path.trim()).filter(path => path.length > 0)
      : []

    let updatedPlugin = { 
      ...plugin,
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
      .update(updatedPlugin)
      .then((res) => {
        contextType.success('Plugin updated successfully')
        if (notifyChange) {
          notifyChange()
        }
        if (onClose) {
          onClose()
        }
      })
      .catch((err) => {
        contextType.error(`Failed to update plugin: ${err.message}`)
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
            onChangeText={(value) => handleChange('Name', value)}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Plugin identifier name
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
            Enable or disable the plugin
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

      <HStack space="md">
        <Button action="primary" size="md" onPress={handleSubmit}>
          <ButtonText>Update</ButtonText>
        </Button>
        {onClose && (
          <Button action="secondary" variant="outline" size="md" onPress={onClose}>
            <ButtonText>Cancel</ButtonText>
          </Button>
        )}
      </HStack>
    </VStack>
  )
}

export default EditPlugin