"""
Bhumi: Agentic Climate Digital Twin
Training script for:
1) XGBoost-style one-year climate-risk forecasting
2) Tiny PyTorch diffusion-style scenario generator

This script works in two modes:
- Real CSV mode: pass --csv your_data.csv
- Demo mode: no CSV needed, synthetic Hyderabad-like data is generated

Expected CSV columns if using real data:
date, region, ndvi, ndwi, ndbi, lst, rainfall, elevation, distance_to_water, flood_risk

Example:
python train_bhumi_models.py --demo
python train_bhumi_models.py --csv gee_features.csv --target flood_risk

Outputs:
outputs/
  forecast_next_12_months.csv
  scenario_samples.csv
  xgb_feature_importance.csv
  plots/*.png
  models/
"""

import argparse
import json
import math
import os
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingRegressor

try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except Exception:
    HAS_XGB = False

try:
    import joblib
except Exception:
    joblib = None

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset


FEATURES = [
    "ndvi",
    "ndwi",
    "ndbi",
    "lst",
    "rainfall",
    "elevation",
    "distance_to_water",
    "month_sin",
    "month_cos",
]


def make_demo_data(n_regions: int = 8, start="2018-01-01", end="2025-12-01") -> pd.DataFrame:
    """Create synthetic but realistic-looking monthly Hyderabad climate-risk data."""
    rng = np.random.default_rng(42)
    dates = pd.date_range(start, end, freq="MS")
    regions = [
        "Musi belt",
        "Hussain Sagar",
        "Kukatpally",
        "HITEC City",
        "Old City",
        "Gachibowli",
        "Ameenpur",
        "Osman Sagar",
    ][:n_regions]

    rows = []
    for r_idx, region in enumerate(regions):
        urban_base = rng.uniform(0.35, 0.75)
        water_distance = rng.uniform(0.2, 4.5)
        elevation = rng.uniform(480, 610)
        for i, date in enumerate(dates):
            month = date.month
            year_trend = i / len(dates)

            monsoon = 1 if month in [6, 7, 8, 9] else 0
            seasonal_rain = 90 * monsoon + 20 * np.sin(2 * np.pi * month / 12)
            rainfall = max(0, seasonal_rain + rng.normal(0, 20))

            ndvi = 0.48 - 0.08 * year_trend - 0.06 * urban_base + 0.05 * monsoon + rng.normal(0, 0.03)
            ndwi = 0.16 + 0.04 * monsoon - 0.05 * year_trend - 0.015 * water_distance + rng.normal(0, 0.025)
            ndbi = urban_base + 0.16 * year_trend + rng.normal(0, 0.035)
            lst = 31 + 4.5 * ndbi - 2.5 * ndvi + 3 * (month in [3, 4, 5]) + rng.normal(0, 1.2)

            low_elev_score = max(0, (580 - elevation) / 120)
            flood_risk = (
                25
                + 18 * (rainfall / 120)
                + 22 * max(0, ndbi)
                + 12 * max(0, 0.45 - ndvi)
                + 10 * max(0, 0.18 - ndwi)
                + 12 * low_elev_score
                + 8 * max(0, 2.5 - water_distance)
                + rng.normal(0, 4)
            )
            flood_risk = float(np.clip(flood_risk, 0, 100))

            rows.append({
                "date": date,
                "region": region,
                "ndvi": float(np.clip(ndvi, -1, 1)),
                "ndwi": float(np.clip(ndwi, -1, 1)),
                "ndbi": float(np.clip(ndbi, -1, 1)),
                "lst": float(lst),
                "rainfall": float(rainfall),
                "elevation": float(elevation),
                "distance_to_water": float(water_distance),
                "flood_risk": flood_risk,
            })

    return pd.DataFrame(rows)


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    month = df["date"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)
    return df


def train_xgb_or_fallback(X_train, y_train):
    if HAS_XGB:
        model = XGBRegressor(
            n_estimators=400,
            max_depth=4,
            learning_rate=0.035,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=42,
        )
    else:
        print("xgboost not found. Using sklearn HistGradientBoostingRegressor fallback.")
        model = HistGradientBoostingRegressor(
            max_iter=350,
            learning_rate=0.04,
            max_leaf_nodes=31,
            random_state=42,
        )
    model.fit(X_train, y_train)
    return model


class DiffusionDenoiser(nn.Module):
    """Tiny denoising network for scenario generation."""
    def __init__(self, input_dim: int, hidden: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim + 2, hidden),  # features + noisy y + timestep
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, 1),
        )

    def forward(self, x, noisy_y, t):
        return self.net(torch.cat([x, noisy_y, t], dim=1))


def train_tiny_diffusion(X, y, out_dir: Path, epochs: int = 80):
    scaler_x = StandardScaler()
    scaler_y = StandardScaler()

    Xs = scaler_x.fit_transform(X)
    ys = scaler_y.fit_transform(y.reshape(-1, 1))

    X_tensor = torch.tensor(Xs, dtype=torch.float32)
    y_tensor = torch.tensor(ys, dtype=torch.float32)

    ds = TensorDataset(X_tensor, y_tensor)
    loader = DataLoader(ds, batch_size=64, shuffle=True)

    model = DiffusionDenoiser(input_dim=X.shape[1])
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
    loss_fn = nn.MSELoss()

    noise_schedule = torch.linspace(0.03, 0.8, 100)

    model.train()
    for epoch in range(epochs):
        total = 0
        for xb, yb in loader:
            t_idx = torch.randint(0, len(noise_schedule), (xb.shape[0], 1))
            t = t_idx.float() / len(noise_schedule)
            sigma = noise_schedule[t_idx].view(-1, 1)
            noise = torch.randn_like(yb)
            noisy_y = yb + sigma * noise

            pred_noise = model(xb, noisy_y, t)
            loss = loss_fn(pred_noise, noise)

            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item()

        if (epoch + 1) % 20 == 0:
            print(f"Diffusion epoch {epoch+1}/{epochs}, loss={total/len(loader):.4f}")

    if joblib:
        joblib.dump(scaler_x, out_dir / "models" / "diffusion_scaler_x.pkl")
        joblib.dump(scaler_y, out_dir / "models" / "diffusion_scaler_y.pkl")
    torch.save(model.state_dict(), out_dir / "models" / "tiny_diffusion_denoiser.pt")

    return model, scaler_x, scaler_y


@torch.no_grad()
def sample_diffusion(model, scaler_x, scaler_y, X_future, n_samples=30, steps=30):
    model.eval()
    Xs = scaler_x.transform(X_future)
    xb = torch.tensor(Xs, dtype=torch.float32)

    samples = []
    for _ in range(n_samples):
        y = torch.randn((xb.shape[0], 1)) * 0.8
        for step in reversed(range(steps)):
            t = torch.full((xb.shape[0], 1), step / steps)
            pred_noise = model(xb, y, t)
            y = y - (0.04 + 0.02 * step / steps) * pred_noise
        y_inv = scaler_y.inverse_transform(y.numpy()).ravel()
        samples.append(y_inv)

    return np.array(samples)


def build_future_features(df: pd.DataFrame, months: int = 12) -> pd.DataFrame:
    """Create next-12-month feature frame by carrying recent regional features forward with trends."""
    df = df.copy()
    latest_date = df["date"].max()
    future_dates = pd.date_range(latest_date + pd.offsets.MonthBegin(1), periods=months, freq="MS")
    rows = []

    for region, g in df.groupby("region"):
        g = g.sort_values("date").tail(12)
        base = g[["ndvi", "ndwi", "ndbi", "lst", "rainfall", "elevation", "distance_to_water"]].mean()

        for i, date in enumerate(future_dates):
            month = date.month
            monsoon = 1 if month in [6, 7, 8, 9] else 0
            row = base.copy()
            row["ndvi"] = row["ndvi"] - 0.003 * i + 0.03 * monsoon
            row["ndwi"] = row["ndwi"] - 0.002 * i + 0.025 * monsoon
            row["ndbi"] = row["ndbi"] + 0.004 * i
            row["lst"] = row["lst"] + 0.03 * i + (2.0 if month in [3, 4, 5] else 0)
            row["rainfall"] = max(0, row["rainfall"] * (1.15 if monsoon else 0.75))
            row["date"] = date
            row["region"] = region
            rows.append(row.to_dict())

    future = pd.DataFrame(rows)
    return add_time_features(future)


def plot_outputs(df, forecast, samples, feature_importance, metrics, out_dir: Path):
    plot_dir = out_dir / "plots"
    plot_dir.mkdir(exist_ok=True)

    city_hist = df.groupby("date")["flood_risk"].mean().reset_index()
    city_forecast = forecast.groupby("date")["xgb_prediction"].mean().reset_index()
    city_diff = forecast.groupby("date")["diffusion_mean"].mean().reset_index()

    plt.figure(figsize=(12, 6))
    plt.plot(city_hist["date"], city_hist["flood_risk"], label="Past observed risk")
    plt.plot(city_forecast["date"], city_forecast["xgb_prediction"], marker="o", label="XGBoost forecast")
    plt.plot(city_diff["date"], city_diff["diffusion_mean"], marker="o", label="Diffusion mean forecast")
    plt.title("Bhumi one-year climate-risk forecast")
    plt.xlabel("Date")
    plt.ylabel("Flood/climate risk score")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(plot_dir / "forecast_next_year.png", dpi=200)
    plt.close()

    fi = feature_importance.sort_values("importance")
    plt.figure(figsize=(10, 6))
    plt.barh(fi["feature"], fi["importance"])
    plt.title("Feature importance")
    plt.xlabel("Importance")
    plt.grid(True, axis="x", alpha=0.3)
    plt.tight_layout()
    plt.savefig(plot_dir / "feature_importance.png", dpi=200)
    plt.close()

    model_names = list(metrics.keys())
    mae = [metrics[m]["mae"] for m in model_names]
    rmse = [metrics[m]["rmse"] for m in model_names]

    x = np.arange(len(model_names))
    width = 0.35
    plt.figure(figsize=(9, 6))
    plt.bar(x - width / 2, mae, width, label="MAE")
    plt.bar(x + width / 2, rmse, width, label="RMSE")
    plt.xticks(x, model_names)
    plt.title("Validation performance")
    plt.ylabel("Error")
    plt.legend()
    plt.grid(True, axis="y", alpha=0.3)
    plt.tight_layout()
    plt.savefig(plot_dir / "validation_performance.png", dpi=200)
    plt.close()

    zone_risk = forecast.groupby("region")["xgb_prediction"].mean().sort_values()
    plt.figure(figsize=(10, 6))
    plt.barh(zone_risk.index, zone_risk.values)
    plt.title("Predicted next-year average risk by Hyderabad zone")
    plt.xlabel("Risk score")
    plt.grid(True, axis="x", alpha=0.3)
    plt.tight_layout()
    plt.savefig(plot_dir / "zone_risk_forecast.png", dpi=200)
    plt.close()

    sample_city = samples.groupby(["sample_id", "date"])["risk_sample"].mean().reset_index()
    plt.figure(figsize=(12, 6))
    for sample_id, g in sample_city.groupby("sample_id"):
        if sample_id < 25:
            plt.plot(g["date"], g["risk_sample"], alpha=0.25)
    plt.title("Diffusion-generated plausible future scenarios")
    plt.xlabel("Date")
    plt.ylabel("Risk score")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(plot_dir / "diffusion_scenarios.png", dpi=200)
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, default=None, help="Path to real GEE feature CSV")
    parser.add_argument("--target", type=str, default="flood_risk", help="Target column")
    parser.add_argument("--out", type=str, default="outputs", help="Output directory")
    parser.add_argument("--demo", action="store_true", help="Use synthetic demo data")
    parser.add_argument("--diffusion-epochs", type=int, default=80)
    args = parser.parse_args()

    out_dir = Path(args.out)
    (out_dir / "models").mkdir(parents=True, exist_ok=True)

    if args.csv:
        df = pd.read_csv(args.csv)
        print(f"Loaded real CSV: {args.csv}")
    else:
        df = make_demo_data()
        print("No CSV supplied. Generated synthetic demo data.")

    df = add_time_features(df)
    df = df.dropna(subset=FEATURES + [args.target])

    X = df[FEATURES].values
    y = df[args.target].values

    # Time-aware split: hold out latest 20%
    df_sorted = df.sort_values("date")
    split_idx = int(len(df_sorted) * 0.8)
    train_df = df_sorted.iloc[:split_idx]
    val_df = df_sorted.iloc[split_idx:]

    X_train, y_train = train_df[FEATURES].values, train_df[args.target].values
    X_val, y_val = val_df[FEATURES].values, val_df[args.target].values

    xgb_model = train_xgb_or_fallback(X_train, y_train)
    val_pred = xgb_model.predict(X_val)

    metrics = {
        "XGBoost" if HAS_XGB else "HGB fallback": {
            "mae": float(mean_absolute_error(y_val, val_pred)),
            "rmse": float(math.sqrt(mean_squared_error(y_val, val_pred))),
            "r2": float(r2_score(y_val, val_pred)),
        }
    }

    # Feature importance
    if HAS_XGB:
        importances = xgb_model.feature_importances_
    else:
        # fallback has no simple feature_importances_
        importances = np.ones(len(FEATURES)) / len(FEATURES)

    feature_importance = pd.DataFrame({
        "feature": FEATURES,
        "importance": importances,
    }).sort_values("importance", ascending=False)

    # Save model
    if joblib:
        joblib.dump(xgb_model, out_dir / "models" / "xgb_or_fallback_model.pkl")

    # Tiny diffusion model
    diffusion_model, scaler_x, scaler_y = train_tiny_diffusion(
        X_train,
        y_train,
        out_dir,
        epochs=args.diffusion_epochs,
    )

    future = build_future_features(df, months=12)
    X_future = future[FEATURES].values

    xgb_future = xgb_model.predict(X_future)
    scenario_array = sample_diffusion(
        diffusion_model,
        scaler_x,
        scaler_y,
        X_future,
        n_samples=40,
        steps=35,
    )

    future["xgb_prediction"] = np.clip(xgb_future, 0, 100)
    future["diffusion_mean"] = np.clip(scenario_array.mean(axis=0), 0, 100)
    future["diffusion_p10"] = np.clip(np.percentile(scenario_array, 10, axis=0), 0, 100)
    future["diffusion_p90"] = np.clip(np.percentile(scenario_array, 90, axis=0), 0, 100)

    scenario_rows = []
    for sample_id, row in enumerate(scenario_array):
        temp = future[["date", "region"]].copy()
        temp["sample_id"] = sample_id
        temp["risk_sample"] = np.clip(row, 0, 100)
        scenario_rows.append(temp)
    scenarios_df = pd.concat(scenario_rows, ignore_index=True)

    forecast_cols = [
        "date",
        "region",
        "xgb_prediction",
        "diffusion_mean",
        "diffusion_p10",
        "diffusion_p90",
        "ndvi",
        "ndwi",
        "ndbi",
        "lst",
        "rainfall",
    ]
    future[forecast_cols].to_csv(out_dir / "forecast_next_12_months.csv", index=False)
    scenarios_df.to_csv(out_dir / "scenario_samples.csv", index=False)
    feature_importance.to_csv(out_dir / "xgb_feature_importance.csv", index=False)

    with open(out_dir / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    plot_outputs(df, future, scenarios_df, feature_importance, metrics, out_dir)

    print("\nTraining complete.")
    print(f"Outputs saved to: {out_dir.resolve()}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
