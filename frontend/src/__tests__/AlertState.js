import {
  filterAlertsByState,
  isAlertResolved,
  normalizeAlertState
} from 'components/Alerts/AlertStateUtil'

test('normalizes missing and legacy alert states consistently', () => {
  expect(normalizeAlertState()).toBe('New')
  expect(normalizeAlertState('')).toBe('New')
  expect(normalizeAlertState('new')).toBe('New')
  expect(normalizeAlertState(' RESOLVED ')).toBe('Resolved')
  expect(isAlertResolved({ State: 'resolved' })).toBe(true)
})

test('uses the same state rules for open and resolved filters', () => {
  const items = [
    { id: 1, State: '' },
    { id: 2, State: 'New' },
    { id: 3, State: 'Resolved' },
    { id: 4, State: 'resolved' }
  ]

  expect(filterAlertsByState(items, 'New').map((item) => item.id)).toEqual([
    1, 2
  ])
  expect(filterAlertsByState(items, 'Resolved').map((item) => item.id)).toEqual([
    3, 4
  ])
  expect(filterAlertsByState(items, 'All')).toHaveLength(4)
})

test('does not count resolved-only buckets as open', () => {
  const resolvedItems = Array.from({ length: 41 }, (_, id) => ({
    id,
    State: 'Resolved'
  }))

  expect(filterAlertsByState(resolvedItems, 'New')).toHaveLength(0)
  expect(filterAlertsByState(resolvedItems, 'Resolved')).toHaveLength(41)
})
