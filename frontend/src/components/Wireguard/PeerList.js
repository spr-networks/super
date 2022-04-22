import React, { useState, useEffect, useRef } from 'react'

import { wireguardAPI, deviceAPI } from 'api'
import WireguardAddPeer from 'components/Wireguard/WireguardAddPeer'
import ModalForm from 'components/ModalForm'
import { prettyDate, prettySize } from 'utils'
//import Toggle from 'components/Toggle'

import {
  Button,
  Label,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

const PeerList = (props) => {
  const [peers, setPeers] = useState(null)
  const [config, setConfig] = useState({})
  const refreshPeers = () => {
    // TODO add to and use this
    /*wireguardAPI.peers().then((list) => {
      setPeers(list)
    })*/

    wireguardAPI.status().then((status) => {
      let publicKey = status.wg0.publicKey,
        listenPort = status.wg0.listenPort

      setConfig({ publicKey, listenPort })
    })

    wireguardAPI.peers().then((list) => {
      deviceAPI
        .list()
        .then((devices) => {
          list = list.map((peer) => {
            let device = Object.values(devices)
              .filter((d) => d.WGPubKey == peer.PublicKey)
              .pop()

            if (device) {
              peer.device = device
            }

            return peer
          })

          setPeers(list)
        })
        .catch((err) => {
          //context.reportError('deviceAPI.list Error: ' + err)
          setPeers(list)
        })
    })
  }

  useEffect(() => {
    refreshPeers()
  }, [])

  const deleteListItem = (peer) => {
    wireguardAPI
      .deletePeer(peer)
      .then(refreshPeers)
      .catch((err) => {})
  }

  const refModal = useRef(null)

  const triggerModal = () => {
    refModal.current()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <ModalForm
            title="Add Wireguard peer"
            triggerText="add"
            triggerClass="pull-right"
            triggerIcon="fa fa-plus"
            modalRef={refModal}
          >
            <WireguardAddPeer config={config} notifyChange={refreshPeers} />
          </ModalForm>

          <CardTitle tag="h4">Peers</CardTitle>
        </CardHeader>
        <CardBody>
          {peers !== null && peers.length ? (
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>Device</th>
                  <th>AllowedIPs</th>
                  <th>Pubkey</th>
                  <th>Last active</th>
                  <th>Transfer</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((peer, i) => (
                  <tr key={peer.AllowedIPs}>
                    <td>{peer.device ? peer.device.Name : `peer #${i + 1}`}</td>
                    <td>{peer.AllowedIPs}</td>
                    <td>{peer.PublicKey}</td>
                    <td>
                      {peer.LatestHandshake
                        ? prettyDate(new Date(peer.LatestHandshake * 1e3))
                        : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {peer.TransferRx ? (
                        <>
                          <div>
                            <i className="fa fa-arrow-circle-o-up text-muted" />{' '}
                            {prettySize(peer.TransferTx)}
                          </div>
                          <div>
                            <i className="fa fa-arrow-circle-o-down text-muted" />{' '}
                            {prettySize(peer.TransferRx)}
                          </div>
                        </>
                      ) : null}
                    </td>
                    <td className="text-center">
                      <Button
                        className="btn-icon"
                        color="danger"
                        size="sm"
                        type="button"
                        onClick={(e) => deleteListItem(peer)}
                      >
                        <i className="fa fa-times" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
          {peers !== null && peers.length === 0 ? (
            <Row>
              <Col md={12} className="text-center">
                {config.listenPort ? (
                  <p>There are no peers configured yet</p>
                ) : (
                  <p>
                    Wireguard is not running. See /configs/wireguard/wg0.conf
                  </p>
                )}

                <Button
                  className="btn-wd btn-round"
                  color="primary"
                  onClick={triggerModal}
                >
                  <i className="fa fa-plus" />
                  add a new peer
                </Button>
              </Col>
            </Row>
          ) : null}
        </CardBody>
      </Card>
    </>
  )
}

export default PeerList
