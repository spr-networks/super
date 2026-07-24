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
  Switch,
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
  const [SandboxedUI, setSandboxedUI] = useState(plugin.SandboxedUI !== false)
  const [HasTopology, setHasTopology] = useState(plugin.HasTopology || false)
  const [InstallTokenPath, setInstallTokenPath] = useState(plugin.InstallTokenPath || '')
  const [ScopedPaths, setScopedPaths] = useState(plugin.ScopedPaths ? plugin.ScopedPaths.join(', ') : '')
  const [Runtime, setRuntime] = useState(plugin.Runtime || 'default')

  useEffect(() => {
    setName(plugin.Name || '')
    setURI(plugin.URI || '')
    setUnixPath(plugin.UnixPath || '')
    setComposeFilePath(plugin.ComposeFilePath || '')
    setEnabled(plugin.Enabled || false)
    setGitURL(plugin.GitURL || '')
    setHasUI(plugin.HasUI || false)
    setSandboxedUI(plugin.SandboxedUI !== false)
    setHasTopology(plugin.HasTopology || false)
    setInstallTokenPath(plugin.InstallTokenPath || '')
    setScopedPaths(plugin.ScopedPaths ? plugin.ScopedPaths.join(', ') : '')
    setRuntime(plugin.Runtime || 'default')
  }, [plugin])

  const availableRuntimes = plugin.AvailableRuntimes || []
  const supportsKVM =
    availableRuntimes.includes('kvm') ||
    plugin.Runtime === 'kvm' ||
    (plugin.ComposeFilePath || '').endsWith('/docker-compose-kvm.yml')
  const supportsDefault =
    availableRuntimes.length === 0 || availableRuntimes.includes('default')
  const canToggleKVM = supportsKVM && supportsDefault

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
      SandboxedUI,
      HasTopology,
      InstallTokenPath,
      ScopedPaths: scopedPathsArray,
      Runtime
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
        {canToggleKVM ? (
          <>
            <HStack alignItems="center" justifyContent="space-between">
              <FormControlLabel>
                <FormControlLabelText>Run in KVM</FormControlLabelText>
              </FormControlLabel>
              <Switch
                value={Runtime === 'kvm'}
                onValueChange={(enabled) =>
                  setRuntime(enabled ? 'kvm' : 'default')
                }
              />
            </HStack>

            <FormControlHelper>
              <FormControlHelperText>
                Turning this off recreates the plugin with docker-compose.yml.
              </FormControlHelperText>
            </FormControlHelper>
          </>
        ) : null}
      </FormControl>

      <FormControl>
        <Checkbox
          value={Enabled}
          isChecked={Enabled}
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
          isChecked={HasUI}
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

      <FormControl>
        <Checkbox
          value={SandboxedUI}
          isChecked={SandboxedUI}
          onChange={setSandboxedUI}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Sandbox UI</CheckboxLabel>
        </Checkbox>

        <FormControlHelper>
          <FormControlHelperText>
            Disable only for legacy plugin UIs that require the signed-in UI credential
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <Checkbox
          value={HasTopology}
          isChecked={HasTopology}
          onChange={setHasTopology}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Has Topology</CheckboxLabel>
        </Checkbox>

        <FormControlHelper>
          <FormControlHelperText>
            Plugin exports nodes and sinks to the network topology view
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
