import { Component } from "react";
import { zoneDescriptions } from "components/Helpers/Api.js";


export default class Zone extends Component {


  async componentDidMount() {
  }

  render() {
    const zone = this.props.zone;

    return (
      <div>
        <pre>
        Zone: {zone.Name } {zoneDescriptions[zone.Name]}

        Clients: {JSON.stringify(zone.Clients) }
        </pre>
      </div>
    )
  }
}
