import { useState } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button, FormControl, Icon, Input, Modal } from 'native-base'

const ModalConfirm = (props) => {
  const [value, setValue] = useState('')
  const [showAlert, setShowAlert] = useState(false)

  const { type, handleSubmit } = props

  const handlePress = () => {
    handleSubmit(value)
    setShowAlert(false)
  }

  return (
    <>
      <Button
        variant="solid"
        colorScheme="primary"
        rounded="full"
        leftIcon={<Icon as={FontAwesomeIcon} icon={faPlus} />}
        onPress={() => setShowAlert(true)}
        {...props}
      >
        {'Add ' + type}
      </Button>

      <Modal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        animationPreset="slide"
      >
        <Modal.Content maxWidth="250px">
          <Modal.CloseButton />
          <Modal.Header>{`Add ${type}`}</Modal.Header>
          <Modal.Body>
            <FormControl>
              {/*<FormControl.Label>
              {type == 'IP' ? 'IP address' : type}
              </FormControl.Label>*/}
              <Input
                name={type}
                value={value}
                variant="outline"
                placeholder={
                  'Enter ' + (type == 'IP' ? 'IP address' : type) + '...'
                }
                autoFocus
                onChangeText={(value) => {
                  setValue(value)
                }}
                onSubmitEditing={handlePress}
              />
            </FormControl>
          </Modal.Body>
          <Modal.Footer>
            <Button w="100%" onPress={handlePress}>
              Save
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal>
    </>
  )
}

ModalConfirm.propTypes = {
  type: PropTypes.string.isRequired,
  handleSubmit: PropTypes.func.isRequired
}

export default ModalConfirm
