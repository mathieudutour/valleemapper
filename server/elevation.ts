/** Height in metres at a position, or nothing outside the grid. */
export type Heights = (lat: number, lon: number) => number | undefined;

/**
 * Reads the grid written by scripts/build_elevation_grid.py: five little-endian float64 (west, north, step in
 * degrees, columns, rows), then little-endian int16 metres row by row from the north. Heights between grid
 * points are interpolated. A file of the wrong size, such as an HTML page served in its place, is refused.
 */
export function heightGrid(buffer: ArrayBuffer): Heights {
  const header = new DataView(buffer, 0, 40);
  const [west, north, step, cols, rows] = [0, 8, 16, 24, 32].map((offset) =>
    header.getFloat64(offset, true),
  );
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 2 ||
    rows < 2 ||
    buffer.byteLength !== 40 + cols * rows * 2
  )
    throw new Error("Not an elevation grid");
  const data = new DataView(buffer, 40);
  const at = (row: number, col: number) =>
    data.getInt16((row * cols + col) * 2, true);
  return (lat, lon) => {
    const y = (north - lat) / step,
      x = (lon - west) / step;
    if (!(x >= 0 && y >= 0 && x <= cols - 1 && y <= rows - 1)) return;
    const row = Math.min(Math.floor(y), rows - 2),
      col = Math.min(Math.floor(x), cols - 2);
    const fy = y - row,
      fx = x - col;
    return (
      (at(row, col) * (1 - fx) + at(row, col + 1) * fx) * (1 - fy) +
      (at(row + 1, col) * (1 - fx) + at(row + 1, col + 1) * fx) * fy
    );
  };
}
