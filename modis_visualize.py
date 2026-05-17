from pathlib import Path
from PIL import Image
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D


# =========================
# Settings
# =========================

IMG_DIR = Path("gibs_modis_images")
FIG_DIR = Path("figures")
FIG_DIR.mkdir(exist_ok=True)

YEARS = [2012, 2014, 2016, 2018, 2020, 2023]


# =========================
# Helper Functions
# =========================

def image_path(year):
    return IMG_DIR / f"modis_terra_ndvi_{year}_july.png"


def show_image(path, title, save_path):
    img = Image.open(path)

    plt.figure(figsize=(14, 6))
    plt.imshow(img)
    plt.axis("off")
    plt.title(title, fontsize=16)
    plt.tight_layout()
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 1
# Regional zoom comparison
# =========================

def crop_region(img, region):
    """
    Crop an image by approximate lon/lat region.

    region = (lon_min, lon_max, lat_min, lat_max)
    Image covers:
      lon: -180 to 180
      lat: 85 to -60
    """
    lon_min, lon_max, lat_min, lat_max = region

    width, height = img.size

    x1 = int((lon_min + 180) / 360 * width)
    x2 = int((lon_max + 180) / 360 * width)

    y1 = int((85 - lat_max) / 145 * height)
    y2 = int((85 - lat_min) / 145 * height)

    return img.crop((x1, y1, x2, y2))


def plot_regional_zoom_comparison():
    img_2012 = Image.open(image_path(2012)).convert("RGB")
    img_2023 = Image.open(image_path(2023)).convert("RGB")

    regions = {
        "Amazon Basin": (-80, -45, -20, 10),
        "Sahel / West Africa": (-20, 35, 5, 20),
        "South Asia": (65, 100, 5, 35),
        "Northern China / Inner Mongolia": (95, 125, 35, 47),
    }

    fig, axes = plt.subplots(len(regions), 2, figsize=(12, 13))

    for row, (region_name, bbox) in enumerate(regions.items()):
        crop_2012 = crop_region(img_2012, bbox)
        crop_2023 = crop_region(img_2023, bbox)

        axes[row, 0].imshow(crop_2012)
        axes[row, 0].set_title(f"{region_name} — July 2012", fontsize=12)
        axes[row, 0].axis("off")

        axes[row, 1].imshow(crop_2023)
        axes[row, 1].set_title(f"{region_name} — July 2023", fontsize=12)
        axes[row, 1].axis("off")

    fig.suptitle(
        "Regional MODIS Terra NDVI Comparison: 2012 vs 2023",
        fontsize=16
    )

    plt.tight_layout()

    save_path = FIG_DIR / "01_regional_zoom_comparison.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 2
# Regional Approximate Greenness Bar Chart
# =========================

def compute_green_score(img):
    """
    Approximate vegetation strength from rendered RGB image.
    This is not raw NDVI. It estimates greenness from image color.
    """
    arr = np.array(img.convert("RGB")).astype(float)

    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]

    green_score = g - (r + b) / 2
    green_score = np.maximum(green_score, 0)

    # Remove mostly black ocean/background pixels
    brightness = (r + g + b) / 3
    land_mask = brightness > 10

    green_score = green_score[land_mask]

    return green_score


def plot_regional_greenness_bar_chart():
    img_2012 = Image.open(image_path(2012)).convert("RGB")
    img_2023 = Image.open(image_path(2023)).convert("RGB")

    regions = {
        "Amazon Basin": (-80, -45, -20, 10),
        "Sahel / West Africa": (-20, 35, 5, 20),
        "South Asia": (65, 100, 5, 35),
        "Northern China /\nInner Mongolia": (95, 125, 35, 47),
    }

    values_2012 = []
    values_2023 = []
    labels = []

    for region_name, bbox in regions.items():
        crop_2012 = crop_region(img_2012, bbox)
        crop_2023 = crop_region(img_2023, bbox)

        green_2012 = compute_green_score(crop_2012)
        green_2023 = compute_green_score(crop_2023)

        values_2012.append(np.mean(green_2012))
        values_2023.append(np.mean(green_2023))
        labels.append(region_name)

    x = np.arange(len(labels))
    width = 0.35

    plt.figure(figsize=(11, 6))
    plt.bar(x - width / 2, values_2012, width, label="July 2012")
    plt.bar(x + width / 2, values_2023, width, label="July 2023")

    plt.title("Average Approximate Greenness by Region: 2012 vs 2023", fontsize=15)
    plt.xlabel("Region")
    plt.ylabel("Average approximate greenness")
    plt.xticks(x, labels)
    plt.legend()
    plt.grid(axis="y", alpha=0.25)

    plt.tight_layout()

    save_path = FIG_DIR / "02_regional_greenness_bar_chart.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 3
# Side-by-side comparison
# =========================

def plot_side_by_side():
    img_2012 = Image.open(image_path(2012))
    img_2023 = Image.open(image_path(2023))

    fig, axes = plt.subplots(1, 2, figsize=(18, 7))

    axes[0].imshow(img_2012)
    axes[0].set_title("July 2012", fontsize=15)
    axes[0].axis("off")

    axes[1].imshow(img_2023)
    axes[1].set_title("July 2023", fontsize=15)
    axes[1].axis("off")

    fig.suptitle("MODIS Terra Monthly NDVI Comparison: 2012 vs 2023", fontsize=18)

    plt.tight_layout()

    save_path = FIG_DIR / "03_side_by_side_2012_2023.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 4
# Small multiples
# =========================

def plot_small_multiples():
    fig, axes = plt.subplots(2, 3, figsize=(18, 9))

    for ax, year in zip(axes.ravel(), YEARS):
        img = Image.open(image_path(year))

        ax.imshow(img)
        ax.set_title(f"July {year}", fontsize=14)
        ax.axis("off")

    fig.suptitle("MODIS Terra Monthly NDVI Across Selected Years", fontsize=18)

    plt.tight_layout()

    save_path = FIG_DIR / "04_small_multiples_modis_terra_ndvi.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 5
# Approximate visual difference
# =========================

def plot_visual_difference():
    img_2012_arr = np.array(
        Image.open(image_path(2012)).convert("RGB")
    ).astype(float)

    img_2023_arr = np.array(
        Image.open(image_path(2023)).convert("RGB")
    ).astype(float)

    diff = img_2023_arr - img_2012_arr

    # This is image-color difference, not raw NDVI subtraction
    diff_mag = np.mean(diff, axis=2)

    plt.figure(figsize=(14, 6))
    plt.imshow(diff_mag, cmap="BrBG")
    plt.colorbar(label="Approximate rendered-image difference")
    plt.axis("off")
    plt.title(
        "Approximate Visual Difference: MODIS NDVI Imagery 2023 − 2012",
        fontsize=15
    )

    plt.tight_layout()

    save_path = FIG_DIR / "05_approx_visual_difference_2023_minus_2012.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Visualization 6
# 3D spike map concept
# =========================

def plot_3d_spike_map():
    img = Image.open(image_path(2023)).convert("RGB")
    arr = np.array(img).astype(float)

    # Downsample so the 3D chart is not too heavy
    step = 30
    small = arr[::step, ::step, :]

    h, w, _ = small.shape

    r = small[:, :, 0]
    g = small[:, :, 1]
    b = small[:, :, 2]

    # Approximate vegetation intensity from green channel
    green_score = g - (r + b) / 2
    green_score = np.maximum(green_score, 0)

    if np.nanmax(green_score) > 0:
        green_score = green_score / np.nanmax(green_score)

    x, y = np.meshgrid(np.arange(w), np.arange(h))
    z = np.zeros_like(x)

    dz = green_score * 8

    fig = plt.figure(figsize=(14, 8))
    ax = fig.add_subplot(111, projection="3d")

    ax.bar3d(
        x.ravel(),
        y.ravel(),
        z.ravel(),
        dx=0.8,
        dy=0.8,
        dz=dz.ravel(),
        shade=True
    )

    ax.set_title(
        "3D Spike Map Concept Using MODIS Terra NDVI Imagery",
        fontsize=15
    )
    ax.set_xlabel("Image X")
    ax.set_ylabel("Image Y")
    ax.set_zlabel("Approx. vegetation intensity")

    ax.view_init(elev=45, azim=-65)

    plt.tight_layout()

    save_path = FIG_DIR / "06_3d_spike_map_concept.png"
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()

    print(f"Saved: {save_path}")


# =========================
# Main
# =========================

def main():
    plot_regional_zoom_comparison()
    plot_regional_greenness_bar_chart()
    plot_side_by_side()
    plot_small_multiples()
    plot_visual_difference()
    plot_3d_spike_map()

    print("All visualizations complete.")


if __name__ == "__main__":
    main()