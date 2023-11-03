import React, { Component, useEffect, useState } from 'react'
import { wireguardAPI } from 'api'
import StatsWidget from './StatsWidget'
import { WaypointsIcon } from 'lucide-react-native'

const WireguardPeers = (props) => {
  const [numPeers, setNumPeers] = useState(0)
  const [numPeersActive, setNumPeersActive] = useState(0)

  useEffect(() => {
    wireguardAPI
      .peers()
      .then((peers) => {
        setNumPeers(peers.length)
        let ts = parseInt(new Date().getTime() / 1e3) - 60 * 2 // active within 2 min
        let active = peers.filter((p) => p.LatestHandshake >= ts).length
        setNumPeersActive(active)
      })
      .catch((err) => {
        //disabled
      })
  }, [])

  /*  textFooter={`Total ${numPeers} clients`}
      iconFooter={faClock}*/

  return (
    <StatsWidget
      {...props}
      icon={WaypointsIcon}
      iconColor="$info400"
      title="VPN Peers"
      text={numPeers}
    />
  )
}

const WireguardPeersActive = (props) => {
  const [numPeers, setNumPeers] = useState(0)
  const [numPeersActive, setNumPeersActive] = useState(0)

  useEffect(() => {
    wireguardAPI
      .peers()
      .then((peers) => {
        setNumPeers(peers.length)
        let ts = parseInt(new Date().getTime() / 1e3) - 60 * 2 // active within 2 min
        let active = peers.filter((p) => p.LatestHandshake >= ts).length
        setNumPeersActive(active)
      })
      .catch((err) => {
        //disabled
      })
  }, [])

  return (
    <StatsWidget
      {...props}
      icon={WaypointsIcon}
      iconColor="$blueGray400"
      title="Active VPN Connections"
      text={numPeersActive}
    />
  )
}

export { WireguardPeers, WireguardPeersActive }
