
import { hostapdAllStations } from "components/Helpers/Api.js";
import { Component } from "react";


export default class WifiClientCount extends Component {

  state = { numberOfClients: 0 };


  async componentDidMount() {
    const stations = await hostapdAllStations();
    this.setState({ numberOfWifiClients: Object.keys(stations).length });
  }

  render() {
    return (
      <div>
        {this.state.numberOfWifiClients}
      </div>
    )
  }
}
