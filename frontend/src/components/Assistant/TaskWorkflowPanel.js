import React, { useEffect, useRef, useState } from 'react'
import { Button, ButtonText, FormControl, FormControlLabel, FormControlLabelText, Input, InputField, Text, VStack, HStack } from '@gluestack-ui/themed'
import { Select } from 'components/Select'
import WireguardConfig from 'components/Wireguard/WireguardConfig'
import { prepareUIOperation, applyUIOperation, discardUIOperation } from './assistantOperations'
import { stageSecureTask, discardSecureTask, secureTaskArtifact, checkSecureTask } from './secureTaskWorkflows'
import { receiptForReview, receiptForApplied, taskReceipt } from './taskRuntime'

export default function TaskWorkflowPanel({ workflow, context, onReceipt, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(workflow.fields.map(f => [f.key, f.defaultValue || ''])))
  const [review, setReview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [artifact, setArtifact] = useState(null)
  const [error, setError] = useState('')
  const reviewRef = useRef(null)
  useEffect(() => () => { discardUIOperation(reviewRef.current); discardSecureTask(workflow.id) }, [workflow.id])
  const update = (key, value) => {
    discardUIOperation(reviewRef.current)
    reviewRef.current = null
    setReview(null)
    setValues(current => ({ ...current, [key]: value }))
  }
  const prepare = async () => {
    setBusy(true); setError('')
    try {
      discardUIOperation(reviewRef.current)
      const proposal = await stageSecureTask(workflow, values)
      const prepared = await prepareUIOperation(proposal, context)
      reviewRef.current = prepared
      setReview(prepared)
      onReceipt(receiptForReview(prepared))
    } catch (error) {
      setError(error.message || 'Could not prepare setup')
    } finally { setBusy(false) }
  }
  const apply = async () => {
    setBusy(true); setError('')
    try {
      const result = await applyUIOperation(review, context)
      setSent(true); setReview(null); reviewRef.current = null
      setArtifact(secureTaskArtifact(workflow.id))
      setValues(current => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, workflow.fields.find(f => f.key === k)?.secret ? '' : v])))
      onReceipt(receiptForApplied(result))
    } catch (error) {
      discardUIOperation(reviewRef.current); reviewRef.current = null; setReview(null)
      setSent(Boolean(error.operationMayHaveApplied))
      onReceipt(taskReceipt(error.operationMayHaveApplied ? 'outcome_unknown' : 'needs_review', error.operationMayHaveApplied
        ? 'The setup outcome is uncertain. Check current configuration before making another change.'
        : 'Setup was not sent. The configuration or selected router may have changed; prepare a fresh review.', { applied: error.operationMayHaveApplied ? null : false }))
      setError('Setup could not be confirmed. Credentials and API response details are not included in chat.')
    } finally { setBusy(false) }
  }
  const check = async () => {
    setBusy(true); setError('')
    try { onReceipt(await checkSecureTask(workflow.id)) }
    catch { onReceipt(taskReceipt('outcome_unknown', 'The connection check could not complete. Current connectivity is unknown.', { applied: null })) }
    finally { setBusy(false) }
  }
  return <VStack space="md" p="$4" borderWidth={1} borderColor="$borderColorCardLight" rounded="$lg">
    <Text bold>{workflow.label}</Text>
    <Text>{workflow.instructions}</Text>
    {!sent ? workflow.fields.map(f => <FormControl key={f.key}>
      <FormControlLabel><FormControlLabelText>{f.label}</FormControlLabelText></FormControlLabel>
      {f.choices ? <Select selectedValue={values[f.key]} onValueChange={v => update(f.key, v)} isDisabled={busy}>
        {f.choices.map(v => <Select.Item key={v} label={v} value={v} />)}
      </Select>
        : <Input><InputField accessibilityLabel={f.label} value={values[f.key]} type={f.secret ? 'password' : 'text'}
          autoComplete="off" autoCorrect={false} isDisabled={busy} onChangeText={v => update(f.key, v)} /></Input>}
    </FormControl>) : null}
    {error ? <Text color="$red600">{error}</Text> : null}
    {review ? <VStack space="sm">
      <Text bold>Review setup</Text>
      <Text>Before: {JSON.stringify(review.before)}</Text>
      <Text>After: {JSON.stringify(review.after)}</Text>
      <Text>No change has been sent. Secret values are hidden; applying checks the current router and settings again.</Text>
      <Button isDisabled={busy} onPress={apply}><ButtonText>Apply reviewed setup</ButtonText></Button>
    </VStack> : !sent ? <Button isDisabled={busy} onPress={prepare}><ButtonText>Review setup</ButtonText></Button> : null}
    {artifact ? <VStack space="sm"><Text>Save this client configuration before closing setup. Its private key is kept only in this form.</Text><WireguardConfig config={artifact} /></VStack> : null}
    <HStack space="sm">
      {sent ? <Button variant="outline" isDisabled={busy} onPress={check}><ButtonText>Check connection</ButtonText></Button> : null}
      <Button variant="outline" isDisabled={busy} onPress={onClose}><ButtonText>Close setup</ButtonText></Button>
    </HStack>
  </VStack>
}
