/** A stage box with a mono kicker over a short meaning. */
export function Cell({ k, v }: { k: string; v: string }) {
  return (
    <span className="ht-cell">
      <b>{k}</b>
      {v}
    </span>
  )
}
