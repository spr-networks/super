import React, { useContext, useState, useEffect } from 'react'

import { pluginAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import PluginPermissionPrompt from './PluginPermissionPrompt'

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
  Text,
  Spinner
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
  
  // Permission prompt states
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false)
  const [fetchingManifest, setFetchingManifest] = useState(false)
  const [manifest, setManifest] = useState(null)
  const [permissions, setPermissions] = useState(null)
  const [permissionsFormatted, setPermissionsFormatted] = useState(null)

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

  // Fetch plugin manifest when GitURL changes
  useEffect(() => {
    if (GitURL && GitURL.trim()) {
      const timer = setTimeout(() => {
        fetchManifest()
      }, 1000) // Debounce for 1 second
      
      return () => clearTimeout(timer)
    }
  }, [GitURL])

  const fetchManifest = async () => {
    setFetchingManifest(true)
    try {
      const manifestData = await pluginAPI.downloadInfo(GitURL)
      setManifest(manifestData)
      
      // Update form fields from manifest if they're empty
      if (manifestData.Name && !Name) setName(manifestData.Name)
      if (manifestData.URI && !URI) setURI(manifestData.URI)
      if (manifestData.UnixPath && !UnixPath) setUnixPath(manifestData.UnixPath)
      if (manifestData.ComposeFilePath && !ComposeFilePath) setComposeFilePath(manifestData.ComposeFilePath)
      if (manifestData.HasUI !== undefined) setHasUI(manifestData.HasUI)
      if (manifestData.InstallTokenPath && !InstallTokenPath) setInstallTokenPath(manifestData.InstallTokenPath)
      if (manifestData.ScopedPaths && !ScopedPaths) {
        setScopedPaths(manifestData.ScopedPaths.join(', '))
      }
      
      // Parse permissions
      const perms = pluginAPI.parsePermissions(manifestData)
      setPermissions(perms)
      setPermissionsFormatted(pluginAPI.formatPermissions(perms))
    } catch (err) {
      console.error('Failed to fetch plugin manifest:', err)
      // Don't show error to user - manifest is optional
    } finally {
      setFetchingManifest(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Check if we need to show permission prompt
    if (GitURL && permissions && permissions.hasToken && !showPermissionPrompt) {
      setShowPermissionPrompt(true)
      return
    }

    submitPlugin()
  }

  const submitPlugin = () => {
    // If this came from a GitURL with manifest, use the complete install API
    if (GitURL && manifest) {
      // Use the manifest data to complete installation
      pluginAPI
        .completeInstall(manifest)
        .then((res) => {
          setShowPermissionPrompt(false)
          if (props.notifyChange) {
            props.notifyChange('plugin')
          }
        })
        .catch((err) => {
          contextType.error(`API Error:`, err)
        })
    } else {
      // Legacy method for manual plugin creation
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
          setShowPermissionPrompt(false)
          if (props.notifyChange) {
            props.notifyChange('plugin')
          }
        })
        .catch((err) => {
          contextType.error(`API Error:`, err)
        })
    }
  }

  const handleAcceptPermissions = () => {
    setShowPermissionPrompt(false)
    submitPlugin()
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

      {/* Permission prompt modal */}
      <PluginPermissionPrompt
        isOpen={showPermissionPrompt}
        onClose={() => setShowPermissionPrompt(false)}
        onAccept={handleAcceptPermissions}
        pluginName={Name || manifest?.Name}
        permissions={permissionsFormatted}
        gitUrl={GitURL}
        networkCapabilities={manifest?.NetworkCapabilities}
      />

      {/* Loading indicator when fetching manifest */}
      {fetchingManifest && (
        <HStack space="sm" alignItems="center" mt="$2">
          <Spinner size="small" />
          <Text size="sm" color="$muted500">
            Loading plugin information...
          </Text>
        </HStack>
      )}
    </VStack>
  )
}

export default AddPlugin
