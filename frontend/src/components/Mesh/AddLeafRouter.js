import React, { useContext } from 'react'
import { useNavigate } from 'react-router-dom'

import ClientSelect from 'components/ClientSelect'

import { AppContext, AlertContext } from 'AppContext'
import APIMesh from 'api/mesh'
import APIFirewall from 'api/Firewall'
import api, {api as xapi, devices, authAPI, meshAPI, wifiAPI, setAuthReturn } from 'api'

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
  Spinner,
  VStack
} from '@gluestack-ui/themed'

class AddLeafRouterImpl extends React.Component {
  state = {
    APIToken: '',
    IP: '',
    Spinning: false,
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

  handleSubmit(event)  {
    event.preventDefault()

    const meshProtocol = () => {
        //return 'https:'
        return window.location.protocol
    }

    let leaf = {
      IP: this.state.IP,
      APIToken: this.state.APIToken
    }

    //check if the IP has a vlan tag, and abort if so

    if (this.props.context) {
      let device = this.props.context.getDevice(leaf.IP, 'RecentIP')
      if (device) {
        if (device.VLANTag != "") {
          this.props.alertContext.error(`The device at ${leaf.IP} has a VLAN Tag. Remove the VLAN Tag before making it an AP Mesh Node`)
          this.props.notifyChange('leaf')
          return
        }
      }
    }

    const done = (res) => {
      this.setState({spinning: false})
      if (this.props.notifyChange) {
        this.props.notifyChange('leaf')
      }
    }

    // turn on a setting up spinner
    this.setState({spinning: true})

    //first, verify that the API Token is correct
    let rMeshAPI = new APIMesh()
    rMeshAPI.setRemoteURL(meshProtocol() + '//' + leaf.IP + '/')
    rMeshAPI.setAuthTokenHeaders(leaf.APIToken)

    //fconfig = await firewallAPI.config()
    //ServicePorts

    rMeshAPI
      .leafMode()
      .then(async (result) => {

        //At this point, communication with the remote Mesh plugins is correct.

        //1. Generate an API Token for the remote Mesh to send in API events


        let tokens
        try {
          tokens = await authAPI.tokens()
        } catch (e) {
           this.props.alertContext.error('Could not set API Tokens. Verify OTP on Auth page')
           setAuthReturn('/admin/auth')
           this.props.navigate('/auth/validate')
           return
        }

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

        // we will program the leaf node to trust our CA
        let our_ca = await xapi.get('/plugins/mesh/cert')
        let status = await rMeshAPI.setParentCredentials({
          ParentAPIToken: parentAPIToken,
          ParentIP: lanIP,
          ParentCA: our_ca
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
          .then(() => {})
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
        rAPI.setRemoteURL(meshProtocol() + '//' + leaf.IP + '/')
        rAPI.setAuthTokenHeaders(leaf.APIToken)
        await rAPI.restart()
      })
      .catch((e) => {
          this.setState({spinning: false})
          console.log(e)
          this.props.alertContext.error('API Failure, Mesh Plugin On?')
          if (this.props.notifyChange) {
            this.props.notifyChange('mesh')
          }

      })
  }

  componentDidMount() {}

  render() {
    if (this.state.spinning) {
      return (
        <VStack space="md">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Updating mesh node</FormControlLabelText>
          </FormControlLabel>
          <Spinner size="small" />
        </FormControl>
        </VStack>
      )
    }

    return (
      <VStack space="md">
        <FormControl flex={1} isRequired>
          <FormControlLabel>
            <FormControlLabelText>Mesh Node Access Point IP</FormControlLabelText>
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
        <FormControl flex={1} isRequired>
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
              API Token for downstream device. Log in to the device and generate an API token with the Mesh Plugin
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
  let context = useContext(AppContext)
  let navigate = useNavigate()
  return (
    <AddLeafRouterImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
      context={context}
      navigate={navigate}
    ></AddLeafRouterImpl>
  )
}
