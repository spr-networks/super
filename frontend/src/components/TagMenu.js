import React, { useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Icon,
  Menu,
  MenuItem,
  MenuItemLabel,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import ModalConfirm from './ModalConfirm'

//TODO support multiple/single picking
const ItemMenu = ({
  newDisabled,
  type,
  items,
  selectedKeys,
  onSelectionChange,
  ...props
}) => {
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState(type || 'Item')

  let letext = `Edit ${type}s`
  if (type == 'Policy') {
    letext = `Edit Policies`
  }

  const trigger =
    props.trigger ||
    ((triggerProps) => (
      <Button action="secondary" variant="outline" size="xs" {...triggerProps}>
        <ButtonText>{letext}</ButtonText>
        <ButtonIcon as={AddIcon} ml="$1" />
      </Button>
    ))

  const handleSubmitNew = (item) => {
    onSelectionChange([...new Set([...selectedKeys, item])])
  }

  return (
    <>
      <Menu
        trigger={trigger}
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={(e) => {
          let key = e.currentKey
          if (key == 'newItem') {
            setShowModal(true)
          } else {
            let [action, item] = key.split(':')
            let nitems = []
            if (action == 'delete') {
              nitems = selectedKeys.filter((t) => t != item)
            } else {
              nitems = [...new Set([...selectedKeys, item])]
            }

            onSelectionChange(nitems)
          }
        }}
      >
        {(newDisabled ? null : (
          <MenuItem key="newItem" textValue="newItem">
            <MenuItemLabel size="sm">{`New ${type}`}</MenuItemLabel>
          </MenuItem>
        ))}
        {items.map((item) => (
          <MenuItem
            key={
              selectedKeys?.includes(item) ? `delete:${item}` : `add:${item}`
            }
            value={item}
          >
            <Icon
              as={selectedKeys?.includes(item) ? CloseIcon : AddIcon}
              mr="$2"
            />
            <MenuItemLabel size="sm">{item}</MenuItemLabel>
          </MenuItem>
        ))}

      </Menu>
      <ModalConfirm
        type={modalType}
        onSubmit={handleSubmitNew}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </>
  )
}

const TagMenu = (props) => {
  return <ItemMenu type="Tag" {...props} />
}

const GroupMenu = (props) => {
  return <ItemMenu type="Group" {...props} />
}

const PolicyMenu = (props) => {
  return <ItemMenu newDisabled={true} type="Policy" {...props} />
}

ItemMenu.propTypes = {
  type: PropTypes.string.isRequired,
  items: PropTypes.array.isRequired,
  selectedKeys: PropTypes.array,
  onSelectionChange: PropTypes.func,
  trigger: PropTypes.func,
  newDisabled: PropTypes.boolean
}

TagMenu.propTypes = {
  items: PropTypes.array.isRequired,
  selectedKeys: PropTypes.array,
  onSelectionChange: PropTypes.func,
  trigger: PropTypes.func
}

GroupMenu.propTypes = {
  items: PropTypes.array.isRequired,
  selectedKeys: PropTypes.array,
  onSelectionChange: PropTypes.func,
  trigger: PropTypes.func
}

PolicyMenu.propTypes = {
  items: PropTypes.array.isRequired,
  selectedKeys: PropTypes.array,
  onSelectionChange: PropTypes.func,
  trigger: PropTypes.func
}

export default TagMenu

export { ItemMenu, TagMenu, GroupMenu, PolicyMenu }
