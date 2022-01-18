
import { hostapdAllStations } from "components/Helpers/Api.js";
import { Component } from "react";


export default class WifiClientCount extends Component {

  state = { numberOfClients: 0 };

  getWifiClientCount() {
    return new Promise((resolve) =>  {
      hostapdAllStations(function(data) {
        resolve(Object.keys(data).length)
      })
    })
  }

  async componentDidMount() {
    const num = await this.getWifiClientCount();
    this.setState({ numberOfWifiClients: num });
  }

  render() {
    return (
      <div>
        {this.state.numberOfWifiClients}
      </div>
    )
  }
}
