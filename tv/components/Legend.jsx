const Key = ({ color, children }) => (
  <span class="tv-key"><i class={`tv-dot ${color}`} />{children}</span>
)

export function Legend({ zone }) {
  return (
    <footer class="tv-legend">
      <span class="tv-key"><b>OK</b>Chart</span>
      <Key color="green">Add symbol</Key>
      {zone === 'board' && <Key color="red">Remove symbol</Key>}
      <Key color="yellow">Sort</Key>
      <span class="tv-key"><b>◀ ▶</b>{zone === 'board' ? 'Markets' : 'Watchlist'}</span>
      <span class="tv-key"><b>CH</b>Page</span>
      <span class="tv-key"><b>Back</b>Exit</span>
    </footer>
  )
}
