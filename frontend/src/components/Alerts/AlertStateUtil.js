export const normalizeAlertState = (state) =>
  String(state || '')
    .trim()
    .toLowerCase() === 'resolved'
    ? 'Resolved'
    : 'New'

export const isAlertResolved = (item) =>
  normalizeAlertState(item?.State) === 'Resolved'

export const filterAlertsByState = (items, stateFilter) => {
  if (stateFilter === 'All') return items
  return items.filter(
    (item) => normalizeAlertState(item.State) === stateFilter
  )
}
