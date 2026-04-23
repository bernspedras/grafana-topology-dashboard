// ─── Sequence diagram self-loop path ────────────────────────────────────────
//
// Draws a rectangular-ish loop to the right:
//   source → right → down → left → target
// Mimics UML sequence diagram self-call notation.

/**
 * Builds an SVG path string for a self-loop edge in a sequence diagram.
 *
 * @param sx Source x coordinate
 * @param sy Source y coordinate
 * @param tx Target x coordinate
 * @param ty Target y coordinate
 * @param labelX Horizontal center of the edge label
 * @param isLowPoly Whether low-poly rendering mode is active
 */
export function sequenceSelfLoopPath(
  sx: number, sy: number,
  tx: number, ty: number,
  labelX: number,
  isLowPoly: boolean,
): string {
  // Vertical segment of the loop. For full cards it sits just before the card's
  // left edge; for low-poly tags it extends slightly past the tag.
  const rx = isLowPoly ? labelX + 35 : labelX - 125;
  const cornerR = Math.min(8, Math.abs(ty - sy) / 2);
  return (
    `M ${String(sx)},${String(sy)} ` +
    `L ${String(rx - cornerR)},${String(sy)} ` +
    `Q ${String(rx)},${String(sy)} ${String(rx)},${String(sy + cornerR)} ` +
    `L ${String(rx)},${String(ty - cornerR)} ` +
    `Q ${String(rx)},${String(ty)} ${String(rx - cornerR)},${String(ty)} ` +
    `L ${String(tx)},${String(ty)}`
  );
}
