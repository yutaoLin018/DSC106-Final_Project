from pathlib import Path
import json
import numpy as np
import rasterio

# -----------------------------
# CONFIG
# -----------------------------
RAW_DIR = Path("actual_modis_ndvi_raw")
OUT_DIR = Path("data")
OUT_DIR.mkdir(exist_ok=True)

FILES = {
    "2000": RAW_DIR / "MOD13A3_NDVI_2000.tif",
    "2013": RAW_DIR / "MOD13A3_NDVI_2013.tif",
    "2025": RAW_DIR / "MOD13A3_NDVI_2025.tif",
}

# Level of detail files:
# low    = global view
# medium = region view
# high   = zoomed-in view
DETAIL_LEVELS = {
    "low": 80,
    "medium": 45,
    "high": 35,
}

# Small overlap to hide white seams between adjacent blocks.
# 0.000 = exact edges
# 0.001 = tiny overlap, usually best
# 0.005 = stronger overlap
BLOCK_PAD = 0.001

# Coordinate precision for exported GeoJSON.
# 6 decimal places is still very precise for web maps.
COORD_PRECISION = 6

# Valid MODIS NDVI range after scale factor
NDVI_MIN = -0.2
NDVI_MAX = 1.0


def clamp(value, low, high):
    return max(low, min(high, value))


def make_block_polygon(transform, row_start, col_start, row_end, col_end, pad=0.001):
    """
    Build polygon from exact raster block boundaries.

    This makes adjacent blocks touch cleanly instead of leaving gaps caused by
    center-point sizing.
    """
    x_left, y_top = transform * (col_start, row_start)
    x_right, y_bottom = transform * (col_end, row_end)

    west = min(x_left, x_right)
    east = max(x_left, x_right)
    south = min(y_top, y_bottom)
    north = max(y_top, y_bottom)

    # Tiny expansion to avoid visible rendering seams in Mapbox.
    if pad > 0:
        cx = (west + east) / 2
        cy = (south + north) / 2
        half_w = (east - west) / 2 * (1 + pad)
        half_h = (north - south) / 2 * (1 + pad)

        west = cx - half_w
        east = cx + half_w
        south = cy - half_h
        north = cy + half_h

    west = round(float(west), COORD_PRECISION)
    east = round(float(east), COORD_PRECISION)
    south = round(float(south), COORD_PRECISION)
    north = round(float(north), COORD_PRECISION)

    return {
        "type": "Polygon",
        "coordinates": [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
        ]]
    }


def polygon_center(geometry):
    """
    Get center of a rectangular polygon.
    Used only for coordinate validation.
    """
    coords = geometry["coordinates"][0]

    lons = [p[0] for p in coords]
    lats = [p[1] for p in coords]

    return sum(lons) / len(lons), sum(lats) / len(lats)


def read_ndvi_tif(path):
    with rasterio.open(path) as src:
        arr = src.read(1).astype("float32")
        transform = src.transform
        nodata = src.nodata

    if nodata is not None:
        arr[arr == nodata] = np.nan

    # MOD13A3 NDVI is usually stored as scaled integer.
    # Scale factor is 0.0001.
    finite = arr[np.isfinite(arr)]

    if finite.size > 0 and np.nanmax(np.abs(finite)) > 2:
        arr = arr * 0.0001

    # Remove invalid NDVI values.
    arr[(arr < NDVI_MIN) | (arr > NDVI_MAX)] = np.nan

    return arr, transform


def block_mean(arr, row, col, block_size):
    block = arr[row:row + block_size, col:col + block_size]

    if block.size == 0:
        return np.nan

    finite = block[np.isfinite(block)]

    if finite.size == 0:
        return np.nan

    return float(np.nanmean(finite))


def ndvi_to_display_value(ndvi, p05, p95):
    """
    Convert actual NDVI into a 0–1 display value using percentile stretching.
    This improves visual contrast compared with raw NDVI.
    """
    norm = (ndvi - p05) / (p95 - p05 + 1e-9)
    return clamp(norm, 0, 1)


def ndvi_to_height(ndvi, p05, p95):
    """
    Stronger visual contrast:
    - very low NDVI stays almost flat
    - moderate NDVI becomes medium height
    - high NDVI becomes clearly tall
    """
    norm = ndvi_to_display_value(ndvi, p05, p95)

    if norm < 0.15:
        return 300

    if norm < 0.35:
        return 1200 + ((norm - 0.15) / 0.20) * 8000

    return 9000 + (norm ** 2.1) * 650000


def convert_one_year_detail(year, tif_path, detail_name, block_size):
    if not tif_path.exists():
        raise FileNotFoundError(f"Missing file: {tif_path}")

    print(f"Reading {year} / {detail_name}: {tif_path}")
    arr, transform = read_ndvi_tif(tif_path)

    valid = arr[np.isfinite(arr)]
    valid = valid[(valid >= -0.05) & (valid <= 1.0)]

    if valid.size == 0:
        raise ValueError(f"No valid NDVI values found for {year}")

    p05 = np.percentile(valid, 5)
    p95 = np.percentile(valid, 95)

    print(f"{year} {detail_name} NDVI stretch: p05={p05:.3f}, p95={p95:.3f}")

    nrows, ncols = arr.shape
    features = []

    for row in range(0, nrows, block_size):
        for col in range(0, ncols, block_size):
            row_end = min(row + block_size, nrows)
            col_end = min(col + block_size, ncols)

            ndvi = block_mean(arr, row, col, block_size)

            if not np.isfinite(ndvi):
                continue

            # Skip mostly water / invalid negative values.
            # Keep barren land near zero because it is meaningful.
            if ndvi < -0.05:
                continue

            geometry = make_block_polygon(
                transform,
                row,
                col,
                row_end,
                col_end,
                pad=BLOCK_PAD
            )

            lon, lat = polygon_center(geometry)

            # Keep only valid Mapbox coordinates.
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue

            # Match the map extent used in the website.
            if lat < -60 or lat > 85:
                continue

            greenness = ndvi_to_display_value(ndvi, p05, p95)
            height = ndvi_to_height(ndvi, p05, p95)

            features.append({
                "type": "Feature",
                "properties": {
                    "ndvi": round(float(ndvi), 5),
                    "greenness": round(float(greenness), 5),
                    "height": round(float(height), 2)
                },
                "geometry": geometry
            })

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    out_path = OUT_DIR / f"actual_ndvi_spikes_{year}_{detail_name}.geojson"

    # separators=(",", ":") removes unnecessary spaces and reduces file size.
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    print(f"Saved {len(features):,} spikes to {out_path}")


def main():
    for year, path in FILES.items():
        for detail_name, block_size in DETAIL_LEVELS.items():
            convert_one_year_detail(year, path, detail_name, block_size)


if __name__ == "__main__":
    main()