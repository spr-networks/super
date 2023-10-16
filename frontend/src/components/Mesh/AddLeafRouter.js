import React, { useContext } from 'react'

import ClientSelect from 'components/ClientSelect'

import { AlertContext } from 'AppContext'
import APIMesh from 'api/mesh'
import api, { authAPI, meshAPI, wifiAPI } from 'api'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelper,
  FormControlHelperText,
  Input,
  InputField,
  VStack
} from '@gluestack-ui/themed'

class AddLeafRouterImpl extends React.Component {
  state = {
    APIToken: '',
    IP: ''
  }

  constructor(props) {
    super(props)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    //TODO verify IP && port
    this.setState({ [name]: value })
  }

  handleSubmit(event) {
    event.preventDefault()

    let leaf = {
      IP: this.state.IP,
      APIToken: this.state.APIToken
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('leaf')
      }
    }

    //first, verify that the API Token is correct
    let rMeshAPI = new APIMesh()
    rMeshAPI.setRemoteURL('http://' + leaf.IP + '/')
    rMeshAPI.setAuthTokenHeaders(leaf.APIToken)

    rMeshAPI
      .leafMode()
      .then(async (result) => {
        //At this point, communication with the remote Mesh plugins is correct.

        //1. Generate an API Token for the remote Mesh to send in API events

        let tokens = await authAPI.tokens()
        let parentAPIToken = ''

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].Name == 'PLUS-MESH-API-TOKEN') {
            parentAPIToken = tokens[i].Token
            break
          }
        }

        if (parentAPIToken == '') {
          let paths = [
            '/reportPSKAuthSuccess',
            '/reportPSKAuthFailure',
            '/reportDisconnect'
          ]
          let token = await authAPI.putToken('PLUS-MESH-API-TOKEN', 0, paths)
          if (token) {
            parentAPIToken = token.Token
          } else {
            this.props.alertContext.error('Could not generate Parent Token')
            return
          }
        }

        //tbd Fix with fetch of LANIP
        let lanIP = leaf.IP.split('.').slice(0, 3).join('.') + '.1'

        let status = await rMeshAPI.setParentCredentials({
          ParentAPIToken: parentAPIToken,
          ParentIP: lanIP
        })
        if (status != true) {
          this.props.alertContext.error(
            'Failed to program leaf with parent api token'
          )
          return
        }

        //enable mesh mode
        status = await rMeshAPI.setLeafMode('enable')
        if (status != true) {
          this.props.alertContext.error('Failed to enable leaf mode')
          return
        }

        meshAPI
          .addLeafRouter(leaf)
          .then(done)
          .catch((err) => {
            this.props.alertContext.error('Mesh API Failure', err)
          })

        wifiAPI
          .syncMesh()
          .then(done)
          .catch((err) => {
            this.props.alertContext.error(
              'Wifi API Failure while syncing mesh devices.json'
            )
          })

        //restart the leaf router
        let rAPI = new api()
        rAPI.setRemoteURL('http://' + leaf.IP + '/')
        rAPI.setAuthTokenHeaders(leaf.APIToken)
        await rAPI.restart()
      })
      .catch((e) => {
        console.log(e)
        this.props.alertContext.error('API Failure, Mesh Plugin On?')
      })
  }

  componentDidMount() {}

  render() {
    return (
      <VStack space="md">
        <FormControl flex="1" isRequired>
          <FormControlLabel>
            <FormControlLabelText>Leaf Router IP</FormControlLabelText>
          </FormControlLabel>
          <ClientSelect
            name="IP"
            value={this.state.IP}
            onSubmitEditing={(value) => this.handleChange('IP', value)}
            onChangeText={(value) => this.handleChange('IP', value)}
            onChange={(value) => this.handleChange('IP', value)}
          />
          <FormControlHelper>
            <FormControlHelperText>IP address</FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <FormControl flex="1" isRequired>
          <FormControlLabel>
            <FormControlLabelText>API Token</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              value={this.state.APIToken}
              onChangeText={(value) => this.handleChange('APIToken', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              API Token for downstream device. Log in and generate an API token
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <Button action="primary" size="md" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

export default function AddLeafRouter(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddLeafRouterImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddLeafRouterImpl>
  )
}
