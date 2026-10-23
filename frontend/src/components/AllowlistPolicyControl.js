import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'

import {
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  HStack,
  Link,
  LinkText
} from '@gluestack-ui/themed'
import { Select } from 'components/Select'
import {
  selectedAllowlistPolicy,
  setAllowlistEnabled,
  setAllowlistPolicy
} from 'utils/allowlist'

const AllowlistPolicyControl = ({ policies, allowlistPolicies, onChange }) => {
  const selected = selectedAllowlistPolicy(policies)
  const hasWAN = policies.includes('wan')
  const [enabled, setEnabled] = useState(Boolean(selected))
  const navigate = useNavigate()

  useEffect(() => {
    if (selected) setEnabled(true)
    if (hasWAN) setEnabled(false)
  }, [selected, hasWAN])

  const toggle = () => {
    const nextEnabled = !enabled
    setEnabled(nextEnabled)
    onChange(setAllowlistEnabled(policies, nextEnabled))
  }

  return (
    <HStack space="md" alignItems="center" flexWrap="wrap">
      <Checkbox
        value="allowlist"
        isChecked={enabled}
        onChange={toggle}
        accessibilityLabel="Whitelist"
      >
        <CheckboxIndicator mr="$2">
          <CheckboxIcon />
        </CheckboxIndicator>
        {enabled ? null : <CheckboxLabel>Whitelist</CheckboxLabel>}
      </Checkbox>
      {enabled ? (
        <Link onPress={() => navigate('/admin/firewall?tab=Whitelists')}>
          <LinkText>Whitelist</LinkText>
        </Link>
      ) : null}
      {enabled ? (
        <Select
          w={280}
          maxWidth="$full"
          selectedValue={selected}
          selectedLabel={selected.replace('allowlist:', '')}
          placeholder="Select whitelist"
          onValueChange={(value) =>
            onChange(setAllowlistPolicy(policies, value))
          }
          accessibilityLabel="Select whitelist"
        >
          {(allowlistPolicies || []).map((policy) => (
            <Select.Item
              key={policy}
              label={policy.replace('allowlist:', '')}
              value={policy}
            />
          ))}
        </Select>
      ) : null}
    </HStack>
  )
}

AllowlistPolicyControl.propTypes = {
  policies: PropTypes.arrayOf(PropTypes.string),
  allowlistPolicies: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired
}

export default AllowlistPolicyControl
