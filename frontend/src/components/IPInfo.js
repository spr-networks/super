import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { wifiAPI } from 'api'
import { ModalContext } from 'layouts/Admin'

const IPInfo = (props) => {
  const contextType = useContext(ModalContext)

  const handleClick = (e) => {
    let ip = e.target.innerText
    wifiAPI
      .asn(ip)
      .then((asn) => {
        //const handleClickBlock = () => alert('*TODO* block')

        contextType.modal(
          'IP ASN information',
          <>
            <div>
              <label>ASN:</label> {asn.ASN}
            </div>
            <div>
              <label>Name:</label> {asn.Name}
            </div>
            <div>
              <label>Country:</label> {asn.Country}
            </div>
            {/*<div>
              <a className="btn btn-wd" href="/admin/dnsBlock" onClick={handleClickBlock}>
                block this ip
              </a>
            </div>*/}
          </>
        )
      })
      .catch((err) => {
        contextType.modal('IP info', `click ip: ${ip}`)
      })
  }
  return (
    <a onClick={handleClick}>{props.value || props.ip || props.children}</a>
  )
}

IPInfo.propTypes = {}

export default IPInfo
