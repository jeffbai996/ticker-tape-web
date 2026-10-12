// Table rows and cells that navigate on click are not focusable by default,
// so keyboard users and the TV remote could see them but never open them.
// Spread these props instead of a bare onClick:
//
//   <tr {...rowActivation(() => openResearch(sym))}>
//
// Rows that expand in place instead of navigating pass { role: 'button' }.
// Enter and Space count only when pressed on the row itself; a button or
// link inside the row keeps its own keys.
export function rowActivation(onActivate, { role = 'link' } = {}) {
  return {
    tabIndex: 0,
    role,
    onClick: onActivate,
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      onActivate(event)
    },
  }
}
