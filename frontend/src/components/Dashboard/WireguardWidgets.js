import React, { Component, useEffect, useState } from 'react'
import { wireguardAPI } from 'api'
import StatsWidget from './StatsWidget'
import { faClock, faCircleNodes } from '@fortawesome/free-solid-svg-icons'

const WireguardPeers = (props) => {
  const [numPeers, setNumPeers] = useState(0)
  const [numPeersActive, setNumPeersActive] = useState(0)

  useEffect(() => {
    wireguardAPI.peers().then((peers) => {
      setNumPeers(peers.length)
      let ts = parseInt(new Date().getTime() / 1e3) - 60 * 2 // active within 2 min
      let active = peers.filter((p) => p.LatestHandshake >= ts).length
      setNumPeersActive(active)
    })
  }, [])

  /*  textFooter={`Total ${numPeers} clients`}
      iconFooter={faClock}*/

  return (
    <StatsWidget
      {...props}
      icon={faCircleNodes}
      iconColor="info.400"
      title="VPN Peers"
      text={numPeers}
    />
  )
}

const WireguardPeersActive = (props) => {
  const [numPeers, setNumPeers] = useState(0)
  const [numPeersActive, setNumPeersActive] = useState(0)

  useEffect(() => {
    wireguardAPI.peers().then((peers) => {
      setNumPeers(peers.length)
      let ts = parseInt(new Date().getTime() / 1e3) - 60 * 2 // active within 2 min
      let active = peers.filter((p) => p.LatestHandshake >= ts).length
      setNumPeersActive(active)
    })
  }, [])

  return (
    <StatsWidget
      {...props}
      icon={faCircleNodes}
      iconColor="blueGray.400"
      title="Active VPN Connections"
      text={numPeersActive}
    />
  )
}

export { WireguardPeers, WireguardPeersActive }
