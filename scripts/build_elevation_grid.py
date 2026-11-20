#!/usr/bin/env python3
"""Crop 1-arc-second HGT tiles into the height grid the API samples along walks.

Usage: build_elevation_grid.py TILE_DIR OUTPUT WEST SOUTH EAST NORTH

Points every 2 arc-seconds (about 43 m by 62 m here), each the mean of its 3x3 one-arc-second
neighbourhood to soften the terrain model's noise. Output layout: five little-endian float64
(west, north, step in degrees, columns, rows), then little-endian int16 metres, row by row from the north.
"""
import array, math, pathlib, struct, sys

tile_dir, output = map(pathlib.Path, sys.argv[1:3])
west, south, east, north = map(float, sys.argv[3:7])
SIZE = 3601
tiles = {}
for path in tile_dir.glob('*.hgt'):
    name = path.name  # N45E006.hgt
    heights = array.array('h')
    heights.frombytes(path.read_bytes())
    if sys.byteorder == 'little':
        heights.byteswap()  # HGT is big-endian
    tiles[(int(name[1:3]), int(name[4:7]))] = heights
top = max(lat for lat, _ in tiles) + 1
left = min(lng for _, lng in tiles)
rows_of_tiles = top - min(lat for lat, _ in tiles)
cols_of_tiles = max(lng for _, lng in tiles) + 1 - left


def pixel(r, c):
    """Height at one-arc-second row r (from the grid's top edge) and column c, or None for a void."""
    k, m = min(r // 3600, rows_of_tiles - 1), min(c // 3600, cols_of_tiles - 1)
    value = tiles[(top - 1 - k, left + m)][(r - k * 3600) * SIZE + (c - m * 3600)]
    return None if value == -32768 else value


step = 2 / 3600
cols = math.floor(round((east - west) / step, 6)) + 1
rows = math.floor(round((north - south) / step, 6)) + 1
out = array.array('h')
for i in range(rows):
    r = round((top - (north - i * step)) * 3600)
    for j in range(cols):
        c = round((west + j * step - left) * 3600)
        values = [v for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (v := pixel(r + dr, c + dc)) is not None]
        out.append(round(sum(values) / len(values)) if values else 0)
if sys.byteorder != 'little':
    out.byteswap()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(struct.pack('<5d', west, north, step, cols, rows) + out.tobytes())
print('Elevation grid', cols, 'x', rows, output.stat().st_size, 'bytes', flush=True)
