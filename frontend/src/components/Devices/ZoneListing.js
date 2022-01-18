
import { getZones } from "components/Helpers/Api.js";
import { Component } from "react";
import Zone from "components/Devices/Zone.js"


export default class ZoneListing extends Component {

  state = { zones : {}, after: [] };


  async componentDidMount() {
    const z = await getZones()
    this.setState({ zones: z })

    let divs = []
    z.forEach(function(v, x) {
          divs.push( <Zone zone={v} /> )
       });

     this.setState({ zones: z, after: divs })

  }

  render() {
    return (
      <div>
        <pre>
        { JSON.stringify(this.state.zones, null, 2) }
        { this.state.after }
        </pre>
      </div>
    )
  }
}
