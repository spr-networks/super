import React, { useEffect, useRef, useState } from 'react'

import { Button, Modal } from 'reactstrap'

const ModalForm = (props) => {
  const [show, setShow] = useState(false)

  const closeModal = () => setShow(false)
  const toggleModal = () => setShow(!show)

  // this allows us to close the modal using a ref to the modal
  useEffect(() => {
    if (props.modalRef) {
      props.modalRef.current = toggleModal
    }

    return () => {
      if (props.modalRef) {
        props.modalRef.current = null
      }
    }
  })

  let triggerClass = `btn-round ${props.triggerClass}`

  return (
    <>
      {props.triggerText ? (
        <Button
          className={triggerClass}
          color="primary"
          outline
          onClick={toggleModal}
        >
          {props.triggerIcon ? <i className={props.triggerIcon} /> : null}
          {props.triggerText || 'Open Modal'}
        </Button>
      ) : null}
      {show ? (
        <Modal
          fade={false}
          isOpen={show}
          toggle={toggleModal}
          autoFocus={false}
        >
          <div className="modal-header">
            <button
              aria-label="Close"
              className="close"
              data-dismiss="modal"
              type="button"
              onClick={toggleModal}
            >
              <i className="nc-icon nc-simple-remove" />
            </button>
            <h5 className="modal-title">{props.title || 'Title'}</h5>
          </div>
          <div className="modal-body">{props.children}</div>
          <div className="modal-footer"></div>
        </Modal>
      ) : null}
    </>
  )
}

export default ModalForm
