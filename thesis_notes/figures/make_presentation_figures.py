"""
Figures of the v14 presentation (2026-11-08): each one backs a design choice of the current system with real data.

  capacity.png            what each pod count serves (capacity_discovery_log.csv): why the safe level 0.25 s and the bands
  ingress_vs_backend.png  a cpuhog run: the ingress p95 against the backend's own p95 and its event-loop lag (Prometheus):
                          why the NFRs are measured at the ingress
  if_vs_ocsvm.png         Isolation Forest (raw features) against the deployed One-Class SVM on the same 210 healthy
                          readings, along the load and along the latency of 1 pod: why the SVM
  svm_map.png             what the SVM calls healthy for 1 / 2 / 3 pods (load x p95) on one load axis, the overlaps of
                          the bands shaded, with the training readings
  gamma_hills.png         what gamma is: the support vectors of 1 pod as hills along the load, their sum against the
                          threshold, for gamma 0.1 (2 wide hills) and 1.0 (11 narrow ones, 3 holes)
  gamma_choice.png        why gamma 0.1, both sides on 1 pod: holes in the band from gamma 0.2 up (A31), and the p95
                          tolerated at each load, which reaches the NFR below 0.1 (0.05: checked after the choice)
  score_faults.png        the score in the stuck and cpuhog runs of campaign-v14-2026-11-08, agent and HPA
  faults_timeline.png     errors, p95 and ready pods in the same runs
  normal_load.png         the normal load of the same campaign: pods of the agent, the HPA and the needed count, and p95
  window_noise.png        the measured noise of a comparison after a change (window_noise.json): why the verification
                          needs no fixed times

Run from the repo root:  .venv/bin/python3 thesis_notes/figures/make_presentation_figures.py   (needs Prometheus for
ingress_vs_backend.png; it keeps 10 days)
"""
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.ensemble import IsolationForest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path[:0] = [os.path.join(ROOT, "3-ai-agent"), os.path.join(ROOT, "5-ml-training")]
import health_model as hm  # noqa: E402
import nfr_metrics as nfr  # noqa: E402
import train_health_baseline as thb  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "presentation")
RUNS = os.path.join(ROOT, "4-load-testing")
STUCK = ("eval_stuck_llm_20261108_1316", "eval_stuck_hpa_20261108_1337")
CPUHOG = ("eval_cpuhog_llm_20261108_1359", "eval_cpuhog_hpa_20261108_1421")
NORMAL = ("eval_llm_20261108_1443", "eval_hpa_20261108_1527")

INK, MUTED, BG, GRID = "#14213D", "#5B6577", "#FBFAF7", "#E4E1DA"
AGENT, HPA, NFR_C, FILL = "#D9731A", "#3A6EA5", "#A23B4C", "#F4DFC6"
OVERLAP = "#E8B278"   # healthy with either of two pod counts (svm_map.png): FILL's hue, darker
PODS_C = {1: "#9DB4D3", 2: "#5F86B8", 3: "#2F5C94", 4: INK}

plt.rcParams.update({
    "font.size": 18, "axes.titlesize": 19, "axes.labelsize": 18, "legend.fontsize": 16,
    "xtick.labelsize": 16, "ytick.labelsize": 16, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
    "text.color": INK, "xtick.color": MUTED, "ytick.color": MUTED, "axes.facecolor": BG, "figure.facecolor": BG,
    "savefig.facecolor": BG, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 1, "axes.spines.top": False,
    "axes.spines.right": False, "legend.frameon": False, "axes.titleweight": "bold", "axes.titlelocation": "left",
})


def save(fig, name):
    os.makedirs(OUT, exist_ok=True)
    fig.savefig(os.path.join(OUT, name), dpi=160, bbox_inches="tight")
    plt.close(fig)
    print("wrote", name)


def nfr_lines(ax, safe=True):
    ax.axhline(nfr.NFR_P95, color=NFR_C, ls="--", lw=2)
    ax.text(ax.get_xlim()[1], nfr.NFR_P95, " NFR 0.35 s", color=NFR_C, va="center", ha="left", fontsize=15)
    if safe:
        ax.axhline(nfr.SAFE_P95, color=MUTED, ls=":", lw=2)
        ax.text(ax.get_xlim()[1], nfr.SAFE_P95, " ασφαλές 0.25 s", color=MUTED, va="center", ha="left", fontsize=15)


def series(run):
    s = json.load(open(os.path.join(RUNS, run, "series.json")))
    df = pd.DataFrame({k: pd.Series({int(t): v for t, v in vals.items()}) for k, vals in s.items()}).sort_index()
    df.index = pd.to_datetime(df.index, unit="s").tz_localize("UTC").tz_convert("Europe/Athens").tz_localize(None)
    return df


def window(run):
    lines = open(os.path.join(RUNS, run, "window.txt")).read().split("\n")
    return pd.Timestamp(lines[0]), pd.Timestamp(lines[1])


def fault_at(run):
    return pd.Timestamp(open(os.path.join(RUNS, run, "fault_at.txt")).read().strip())


bundle = hm.load(os.path.join(ROOT, "5-ml-training", "health_model.pkl"))
_, health, _ = thb.load_healthy()  # the 210 training readings


def run_scores(df):
    ok = df["throughput"].fillna(0) >= 1.0
    rows = df[ok].assign(error_rate=df["error_rate"].fillna(0.0), latency_p95=df["latency_p95"].fillna(0.0))
    return pd.Series(hm.scores(bundle, rows[["throughput", "latency_p95", "error_rate", "replicas"]]), index=rows.index)


# --- capacity -------------------------------------------------------------------------------------------------------
def fig_capacity():
    cap = pd.read_csv(os.path.join(ROOT, "5-ml-training", "capacity_discovery_log.csv"))
    table = json.load(open(os.path.join(ROOT, "5-ml-training", "capacity_table.json")))
    fig, ax = plt.subplots(figsize=(11, 7))
    for n, g in cap.groupby("replicas"):
        n = int(n)
        m = g.groupby("rate")["latency_p95"].median()
        ax.plot(m.index, m.values, "-o", color=PODS_C[n], lw=3, ms=7, label=f"{n} pod" + ("s" if n > 1 else ""))
        safe = table[str(n)]["max_safe_rps"]
        ax.plot([safe], [m.get(safe, np.nan)], "o", ms=16, mfc="none", mec=AGENT, mew=3)
        ax.annotate(f"{safe:.0f}", (safe, m.get(safe, np.nan)), xytext=(-8, 14), textcoords="offset points",
                    color=AGENT, fontsize=16, fontweight="bold", ha="right")
    ax.set_yscale("log")
    ax.set_ylim(0.06, 1.2)
    ax.set_xlim(20, 345)
    ax.set_yticks([0.1, 0.25, 0.35, 0.5, 1.0])
    ax.set_yticklabels(["0.1", "0.25", "0.35", "0.5", "1"])
    ax.set_xlabel("φορτίο (αιτήματα/s, μίξη χρηστών)")
    ax.set_ylabel("p95 στο ingress (s)")
    nfr_lines(ax)
    ax.legend(loc="upper left")
    ax.set_title("Πόσο φορτίο αντέχει κάθε αριθμός pods")
    save(fig, "capacity.png")


# --- ingress vs backend ----------------------------------------------------------------------------------------------
def prom_range(query, start, end):
    r = requests.get(f"{nfr.PROMETHEUS_URL}/api/v1/query_range", timeout=20, params={
        "query": query, "start": start.tz_localize("Europe/Athens").timestamp(),
        "end": end.tz_localize("Europe/Athens").timestamp(), "step": 10}).json()["data"]["result"]
    if not r:
        return pd.Series(dtype=float)
    v = r[0]["values"]
    idx = pd.to_datetime([float(t) for t, _ in v], unit="s").tz_localize("UTC").tz_convert("Europe/Athens")
    return pd.Series([float(x) for _, x in v], index=idx.tz_localize(None))


def fig_ingress_vs_backend():
    run = CPUHOG[0]
    fault = fault_at(run)
    start, end = fault - pd.Timedelta(minutes=2), fault + pd.Timedelta(minutes=4)
    df = series(run).loc[start:end]
    pod = 'namespace="default", pod=~"aiops-backend-deployment-.*"'
    backend = prom_range('histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket'
                         '{app="aiops-backend"}[1m])))', start, end)
    lag = prom_range(f'max(nodejs_eventloop_lag_p99_seconds{{{pod}}})', start, end)
    m = lambda idx: (idx - fault).total_seconds() / 60  # noqa: E731
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.plot(m(df.index), df["latency_p95"], color=AGENT, lw=3.5, label="p95 στο ingress (ό,τι βλέπει ο χρήστης)")
    ax.plot(m(backend.index), backend.values, color=HPA, lw=3, label="p95 του backend (χρόνος του handler)")
    ax.plot(m(lag.index), lag.values, color=MUTED, lw=2.5, ls="-.", label="event-loop lag p99 του pod")
    ax.axvline(0, color=INK, lw=1.5)
    ax.text(-0.05, 1.75, "cpuhog", fontsize=16, color=INK, ha="right")
    woke = pd.Timestamp("2026-11-08 14:06:40")
    ax.axvline(m(pd.DatetimeIndex([woke]))[0], color=AGENT, lw=1.5, ls=":")
    ax.text(m(pd.DatetimeIndex([woke]))[0] + 0.05, 1.75, "restart", color=AGENT, fontsize=16)
    ax.set_xlim(-2, 4)
    ax.set_ylim(0, 1.9)
    ax.set_xlabel("λεπτά από το σφάλμα")
    ax.set_ylabel("δευτερόλεπτα")
    nfr_lines(ax, safe=False)
    ax.legend(loc="center right", fontsize=15)
    ax.set_title("Cpuhog: το backend μετρά < 0.2 s, ο χρήστης 1.4 s")
    save(fig, "ingress_vs_backend.png")


# --- IF vs OCSVM -----------------------------------------------------------------------------------------------------
def fig_if_vs_ocsvm():
    raw = ["throughput", "latency_p95", "error_rate", "replicas"]
    iforest = IsolationForest(n_estimators=200, contamination=thb.NU, random_state=42).fit(health[raw])
    one = health[health["replicas"] == 1]
    p95_mid = float(one["latency_p95"].median())
    loads = np.geomspace(0.5, 400, 400)
    lats = np.geomspace(0.05, 6.0, 400)
    by_load = pd.DataFrame({"throughput": loads, "latency_p95": p95_mid, "error_rate": 0.0, "replicas": 1.0})
    by_lat = pd.DataFrame({"throughput": 57.0, "latency_p95": lats, "error_rate": 0.0, "replicas": 1.0})
    fig, axes = plt.subplots(2, 2, figsize=(16.6, 8.2), sharex="col")
    for col, (df, x, xlabel) in enumerate([(by_load, loads, "φορτίο (αιτήματα/s), 1 pod, p95 υγιές"),
                                            (by_lat, lats, "p95 (s), 1 pod στα 57 αιτήματα/s")]):
        svm, iso = hm.scores(bundle, df[raw]), iforest.decision_function(df[raw])
        for row, (y, color, name) in enumerate([(svm, AGENT, "One-Class SVM (score)"),
                                                (iso, HPA, "Isolation Forest (decision)")]):
            ax = axes[row, col]
            ax.plot(x, y, color=color, lw=3.5)
            ax.axhline(0, color=INK, lw=1.2)
            ax.set_xscale("log")
            if row == 0:
                ax.set_yscale("symlog", linthresh=1)
                ax.set_yticks([1, 0, -1, -5, -10])
                ax.set_yticklabels(["1", "0", "−1", "−5", "−10"])
            ax.set_ylabel(name, fontsize=16)
            if col == 0:
                lo, hi = one["throughput"].min(), one["throughput"].max()
                ax.axvspan(lo, hi, color=FILL, alpha=0.7, lw=0)
            else:
                ax.axvspan(one["latency_p95"].min(), one["latency_p95"].max(), color=FILL, alpha=0.7, lw=0)
                ax.axvline(nfr.NFR_P95, color=NFR_C, ls="--", lw=2)
            if row == 1:
                ax.set_xlabel(xlabel)
        if col == 0:
            axes[0, 0].set_xticks([1, 10, 100, 400])
            axes[0, 0].set_xticklabels(["1", "10", "100", "400"])
        else:
            axes[0, 1].set_xticks([0.1, 0.35, 1, 5])
            axes[0, 1].set_xticklabels(["0.1", "0.35", "1", "5"])
    # the numbers the slide quotes
    pts = pd.DataFrame({"throughput": [57.0] * 3 + [150.0, 300.0], "latency_p95": [0.4, 1.3, 5.0, p95_mid, p95_mid],
                        "error_rate": 0.0, "replicas": 1.0})
    print("IF vs SVM at (57 rps, 0.4 / 1.3 / 5 s) and (150 / 300 rps, healthy p95):")
    print("  SVM", np.round(hm.scores(bundle, pts[raw]), 2), " IF", np.round(iforest.decision_function(pts[raw]), 3))
    axes[0, 0].set_title("Όσο απομακρύνεται το φορτίο")
    axes[0, 1].set_title("Όσο ανεβαίνει το latency")
    axes[1, 1].text(0.5, 0.045, "0.4 s, 1.3 s και 5 s:\nίδιο score για το IF", color=HPA, fontsize=16)
    axes[1, 0].text(8, 0.04, "1 pod στα 300 αιτ./s: «υγιές» για το IF", color=HPA, fontsize=16, ha="center")
    axes[0, 1].text(0.42, 0.3, "0.4 s → −1.3 · 1.3 s → −4.9 · 5 s → −8.9", color=AGENT, fontsize=15)
    fig.text(0.5, -0.01, "σκιασμένο: το εύρος των υγιών δεδομένων εκπαίδευσης (1 pod)", ha="center", fontsize=15,
             color=MUTED)
    fig.tight_layout()
    save(fig, "if_vs_ocsvm.png")


# --- what the SVM calls healthy --------------------------------------------------------------------------------------
def fig_svm_map():
    """One panel, a common linear load axis: the three healthy regions drawn over each other, so the overlap of the
    bands is seen (until 2026-11-14 three panels on a log axis, where it had to be read from the titles)."""
    x_max, y_lo, y_hi = 270.0, 0.05, 1.0
    loads = np.linspace(0.5, x_max, 540)
    lats = np.geomspace(y_lo, y_hi, 220)
    L, P = np.meshgrid(loads, lats)
    fig, ax = plt.subplots(figsize=(16.6, 6.0))
    band, inside = {}, {}
    for n in (1, 2, 3):
        grid = pd.DataFrame({"throughput": L.ravel(), "latency_p95": P.ravel(), "error_rate": 0.0, "replicas": float(n)})
        d = hm.decision(bundle, grid).reshape(L.shape)
        inside[n] = d >= 0
        ax.contourf(L, P, inside[n], levels=[0.5, 1.5], colors=[FILL], alpha=0.75)
        ax.contour(L, P, d, levels=[0], colors=[AGENT], linewidths=3)
        iv = thb.intervals(bundle, n)
        band[n] = (iv[0][0], iv[-1][1])
        ax.text(sum(band[n]) / 2, 0.76, f"{n} pod{'s' if n > 1 else ''}", ha="center", va="bottom", fontsize=19,
                fontweight="bold")
        ax.text(sum(band[n]) / 2, 0.75, f"{band[n][0]:.1f}–{band[n][1]:.1f} αιτ./s", ha="center", va="top", fontsize=16,
                color=MUTED)
    ax.scatter(health["throughput"], health["latency_p95"], s=26, color=INK, edgecolor=BG, linewidth=0.6, zorder=3,
               label="υγιείς μετρήσεις")
    for n in (1, 2):                                                               # the overlap of n and n + 1 pods
        lo, hi = band[n + 1][0], band[n][1]
        ax.contourf(L, P, inside[n] & inside[n + 1], levels=[0.5, 1.5], colors=[OVERLAP], zorder=1.5)
        for x in (lo, hi):
            ax.plot([x, x], [y_lo, 0.43], color=INK, lw=1.2, ls=":", zorder=2)
        ax.plot([lo, hi], [0.43, 0.43], color=INK, lw=3, solid_capstyle="butt", zorder=4)
        ax.text((lo + hi) / 2, 0.455, f"υγιές με {n} ή {n + 1} pods\n{lo:.1f}–{hi:.1f}", ha="center", va="bottom",
                fontsize=15, linespacing=1.15)
    ax.set_yscale("log")
    ax.set_xlim(0, x_max)
    ax.set_ylim(y_lo, y_hi)
    ax.set_xticks(range(0, 271, 30))
    ax.set_yticks([0.1, 0.25, 0.35, 1.0])
    ax.set_yticklabels(["0.1", "0.25", "0.35", "1"])
    ax.minorticks_off()
    ax.axhline(nfr.NFR_P95, color=NFR_C, ls="--", lw=2)
    ax.text(x_max, nfr.NFR_P95, " NFR 0.35 s", color=NFR_C, va="center", fontsize=15)
    ax.set_xlabel("φορτίο (αιτήματα/s)")
    ax.set_ylabel("p95 (s)")
    ax.legend(loc="lower right", fontsize=14)
    fig.tight_layout()
    save(fig, "svm_map.png")


# --- what gamma is, and why 0.1 --------------------------------------------------------------------------------------
GAMMA_C = {0.05: "#8A93A6", 0.1: AGENT, 0.2: PODS_C[1], 0.5: PODS_C[2], 1.0: PODS_C[3]}
GAMMA_ASIDE = 0.05   # below the declared grid: checked after the choice (2026-11-08), only to show the other side


def gamma_bundle(gamma):
    """The deployed bundle for its own gamma, else the same data and transform fitted with this gamma."""
    if gamma == bundle["gamma"]:
        return bundle
    return {"model": thb.fit(bundle["params"], health, gamma), "params": bundle["params"], "gamma": gamma}


def fig_gamma_hills():
    """1 pod along the load, latency and errors at the safe level: every support vector of 1 pod is a hill
    a_i * exp(-gamma * (ln rps - ln rps_i)^2); the reading is healthy where their sum reaches the threshold rho."""
    loads = np.geomspace(0.6, 300, 3000)
    x = np.log(loads)
    h1 = health[health["replicas"] == 1]["throughput"]
    fig, axes = plt.subplots(1, 2, figsize=(16.6, 6.2), sharey=True)
    for ax, gamma, (peak_at, sign) in zip(axes, (0.1, 1.0), ((1.0, 1), (87.4, -1))):
        m = gamma_bundle(gamma)["model"]
        rho, sv, a = float(m.offset_[0]), m.support_vectors_, m.dual_coef_[0]
        one = np.round(sv[:, 3] / hm.POD_SEPARATION) == 1
        hills = a[one][None] * np.exp(-gamma * (x[:, None] - sv[one, 0][None]) ** 2) / rho
        total = hills.sum(1)
        for i in range(hills.shape[1]):
            ax.plot(loads, hills[:, i], color=HPA, lw=1.6, alpha=0.75, label="ένας λόφος ανά support vector" if i == 0 else None)
        ax.plot(loads, total, color=INK, lw=3.2, label="το άθροισμα")
        ax.axhline(1.0, color=NFR_C, ls="--", lw=2)
        ax.fill_between(loads, 0, 1.25, where=total >= 1.0, color=FILL, alpha=0.7, lw=0, label="υγιές (άθροισμα ≥ κατώφλι)")
        holes = np.flatnonzero(np.diff((total >= 1.0).astype(int)))
        for lo_i, hi_i in zip(holes[1::2], holes[2::2]):
            ax.annotate("τρύπα", (np.sqrt(loads[lo_i] * loads[hi_i]), 1.0), (np.sqrt(loads[lo_i] * loads[hi_i]), 1.17),
                        ha="center", fontsize=14, color=NFR_C, arrowprops={"arrowstyle": "->", "color": NFR_C, "lw": 1.6})
        # the width: where the hill of one end falls to 37% of its peak, 1/sqrt(gamma) units of ln(rps) away
        k = int(np.argmin(abs(np.exp(sv[one, 0]) - peak_at)))
        top = a[one][k] / rho
        far = peak_at * np.exp(sign / np.sqrt(gamma))
        ax.annotate("", (far, top * np.exp(-1)), (peak_at, top * np.exp(-1)),
                    arrowprops={"arrowstyle": "<->", "color": INK, "lw": 1.6})
        units = 1 / np.sqrt(gamma)
        ax.text(np.sqrt(peak_at * far), top * np.exp(-1) - 0.04,
                f"37% σε {units:.2g} μονάδ{'α' if units == 1 else 'ες'}: ×{np.exp(units):.2g} φορτίο",
                ha="center", va="top", fontsize=14, color=INK, bbox={"facecolor": BG, "edgecolor": "none", "alpha": 0.9})
        ax.plot([h1.min(), h1.max()], [0.03, 0.03], color=MUTED, lw=3)
        ax.set_xscale("log")
        ax.set_xlim(0.6, 300)
        ax.set_ylim(0, 1.25)
        ax.set_xticks([1, 3, 10, 30, 100, 300])
        ax.set_xticklabels(["1", "3", "10", "30", "100", "300"])
        ax.set_xlabel("φορτίο (αιτήματα/s), 1 pod")
        n_sv = int(one.sum())
        ax.set_title(f"γ {gamma}: {n_sv} λόφοι, {'φαρδιοί' if gamma < 0.5 else 'στενοί'}", fontsize=18)
    axes[0].set_ylabel("ύψος / κατώφλι ρ")
    axes[0].text(290, 1.02, "κατώφλι ρ", color=NFR_C, fontsize=14, va="bottom", ha="right")
    axes[0].text(np.sqrt(h1.min() * h1.max()), 0.06, "δεδομένα του 1 pod", ha="center", fontsize=14, color=MUTED)
    fig.tight_layout()
    fig.legend(*axes[0].get_legend_handles_labels(), loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=3, fontsize=15)
    save(fig, "gamma_hills.png")


def fig_gamma_choice():
    """Both sides of the choice on 1 pod (2 and 3 pods: one interval with every gamma): the healthy intervals along the
    load, and the p95 the model tolerates at each load before it calls an anomaly (thb.tolerance)."""
    gammas = sorted([GAMMA_ASIDE] + thb.GAMMAS)
    loads = thb.SCAN[(thb.SCAN >= 0.8) & (thb.SCAN <= 120)]
    h1 = health[health["replicas"] == 1]["throughput"]
    fig, (left, right) = plt.subplots(1, 2, figsize=(16.6, 6.2), gridspec_kw={"width_ratios": [1, 1.15]})
    for y, gamma in enumerate(reversed(gammas)):
        chosen = gamma == bundle["gamma"]
        b = gamma_bundle(gamma)
        iv = thb.intervals(b, 1)
        for a, z in iv:
            left.plot([a, z], [y, y], color=GAMMA_C[gamma], lw=12, solid_capstyle="butt")
        holes = len(iv) - 1
        left.text(118, y, "1 διάστημα" if holes == 0 else f"{holes} τρύπ{'α' if holes == 1 else 'ες'}", va="center",
                  fontsize=15, color=NFR_C if holes else INK)
        r, p95, _ = thb.tolerance(b, 1, loads)
        ok = hm.decision(b, thb.rows_at(loads, 1)) >= 0
        right.plot(loads, np.where(ok, p95, np.nan), color=GAMMA_C[gamma], lw=3.4 if chosen else 2.2,
                   ls="--" if gamma == GAMMA_ASIDE else "-", zorder=5 if chosen else 3,
                   label=f"γ {gamma}" + (" *" if gamma == GAMMA_ASIDE else ""))
        k = int(np.nanargmax(np.where(ok, p95, np.nan)))
        if gamma in (GAMMA_ASIDE, bundle["gamma"]):
            right.text(loads[k], p95[k] + 0.006, f"ως {p95[k]:.2f} s", ha="center", va="bottom", fontsize=15,
                       color=GAMMA_C[gamma], fontweight="bold")
    left.plot([h1.min(), h1.max()], [-0.8, -0.8], color=MUTED, lw=3)
    left.text(118, -0.8, "δεδομένα", va="center", fontsize=15, color=MUTED)
    left.text(0.85, -1.45, "* εκτός του δηλωμένου πλέγματος, ελέγχθηκε μετά την επιλογή", va="center", fontsize=13,
              color=MUTED)
    left.set_yticks(range(len(gammas)))
    left.set_yticklabels([f"γ {g}" + (" *" if g == GAMMA_ASIDE else "") for g in reversed(gammas)], fontsize=16)
    left.set_ylim(-1.8, len(gammas) - 0.4)
    left.grid(axis="y", visible=False)
    left.set_title("Μεγάλο γ: τρύπες στη ζώνη του 1 pod", fontsize=18)
    left.set_xlabel("φορτίο που το μοντέλο λέει υγιές (αιτήματα/s)")
    right.set_ylim(0.24, 0.49)
    right.set_title("Μικρό γ: ανέχεται και την ίδια τη NFR", fontsize=18)
    right.set_ylabel("p95 που ανέχεται πριν πει ανωμαλία (s)")
    right.set_xlabel("φορτίο (αιτήματα/s), 1 pod")
    handles, labels = right.get_legend_handles_labels()
    right.legend(handles[::-1], labels[::-1], loc="upper center", fontsize=14, ncol=5, handlelength=1.6, columnspacing=1.0)
    for ax in (left, right):
        ax.set_xscale("log")
        ax.set_xlim(0.8, 120 if ax is right else 260)
        ax.set_xticks([1, 3, 10, 30, 100])
        ax.set_xticklabels(["1", "3", "10", "30", "100"])
    nfr_lines(right)
    fig.tight_layout()
    save(fig, "gamma_choice.png")


# --- the faults ------------------------------------------------------------------------------------------------------
def fig_score_faults():
    fig, axes = plt.subplots(1, 2, figsize=(16.6, 6.4), sharey=True)
    for ax, (title, runs, woke) in zip(axes, [("Stuck", STUCK, "13:23:14"), ("Cpuhog", CPUHOG, "14:06:40")]):
        for run, color, name in zip(runs, (AGENT, HPA), ("agent v14", "HPA")):
            df = series(run)
            fault = fault_at(run)
            sc = run_scores(df.loc[fault - pd.Timedelta(minutes=2): fault + pd.Timedelta(minutes=12)])
            ax.plot((sc.index - fault).total_seconds() / 60, sc.values, color=color, lw=3.2, label=name)
            if run == runs[0]:
                w = (pd.Timestamp(f"{fault.date()} {woke}") - fault).total_seconds() / 60
                ax.axvline(w, color=AGENT, ls=":", lw=1.8)
                ax.text(w + 0.15, 0.35, "restart", color=AGENT, fontsize=15)
        ax.axhline(0, color=INK, lw=1.4)
        ax.axvline(0, color=INK, lw=1)
        ax.set_yscale("symlog", linthresh=1)
        ax.set_yticks([1, 0, -1, -5, -10, -50, -100])
        ax.set_yticklabels(["1", "0", "−1", "−5", "−10", "−50", "−100"])
        ax.set_xlim(-2, 12)
        ax.set_xlabel("λεπτά από το σφάλμα")
        ax.set_title(title)
    axes[0].set_ylabel("score (≥ 0 υγιές · < 0 απόσταση)")
    axes[0].legend(loc="center right")
    fig.tight_layout()
    save(fig, "score_faults.png")


def fig_faults_timeline():
    fig, axes = plt.subplots(3, 2, figsize=(16.6, 8.6), sharex=True)
    for col, (title, runs, woke) in enumerate([("Stuck", STUCK, "13:23:14"), ("Cpuhog", CPUHOG, "14:06:40")]):
        for run, color, name, lw in zip(runs, (AGENT, HPA), ("agent v14", "HPA"), (3.4, 2.6)):
            df = series(run)
            fault = fault_at(run)
            df = df.loc[fault - pd.Timedelta(minutes=2): fault + pd.Timedelta(minutes=12)]
            t = (df.index - fault).total_seconds() / 60
            axes[0, col].plot(t, 100 * df["error_rate"].fillna(0), color=color, lw=lw, label=name)
            axes[1, col].plot(t, df["latency_p95"], color=color, lw=lw)
            axes[2, col].step(t, df["ready_replicas"], where="post", color=color, lw=lw)
            if run == runs[0]:
                w = (pd.Timestamp(f"{fault.date()} {woke}") - fault).total_seconds() / 60
                for ax in axes[:, col]:
                    ax.axvline(w, color=AGENT, ls=":", lw=1.6)
        for ax in axes[:, col]:
            ax.axvline(0, color=INK, lw=1)
        axes[0, col].set_title(title)
        axes[0, col].axhline(1, color=NFR_C, ls="--", lw=1.8)
        axes[1, col].axhline(nfr.NFR_P95, color=NFR_C, ls="--", lw=1.8)
        axes[1, col].set_yscale("log")
        axes[1, col].set_yticks([0.05, 0.35, 1, 5])
        axes[1, col].set_yticklabels(["0.05", "0.35", "1", "5"])
        axes[2, col].set_ylim(-0.2, 2.4)
        axes[2, col].set_yticks([0, 1, 2])
        axes[2, col].set_xlabel("λεπτά από το σφάλμα")
        axes[2, col].set_xlim(-2, 12)
    axes[0, 0].set_ylabel("σφάλματα %")
    axes[1, 0].set_ylabel("p95 (s)")
    axes[2, 0].set_ylabel("έτοιμα pods")
    axes[0, 0].legend(loc="center right")
    fig.tight_layout()
    save(fig, "faults_timeline.png")


# --- normal load -----------------------------------------------------------------------------------------------------
def fig_normal_load():
    table = {int(k): v["max_safe_rps"] for k, v in json.load(open(os.path.join(ROOT, "5-ml-training",
                                                                                "capacity_table.json"))).items()
             if int(k) <= nfr.MAX_PODS}
    need = lambda rps: next((n for n in sorted(table) if rps <= table[n]), max(table))  # noqa: E731 (evaluate_run)
    fig, axes = plt.subplots(2, 1, figsize=(16.6, 8.4), sharex=True, gridspec_kw={"height_ratios": [1.15, 1]})
    for run, color, name, lw in zip(NORMAL, (AGENT, HPA), ("agent v14", "HPA"), (3.6, 2.8)):
        df = series(run)
        start, end = window(run)
        df = df.loc[start:end]
        t = (df.index - start).total_seconds() / 60
        axes[0].step(t, df["replicas"], where="post", color=color, lw=lw, label=f"{name}: pods")
        axes[1].plot(t, df["latency_p95"], color=color, lw=lw * 0.8, label=name)
        if run == NORMAL[0]:
            axes[0].step(t, [need(x) for x in df["throughput"].fillna(0)], where="post", color=MUTED, lw=2, ls="--",
                         label="χρειάζονται (πίνακας)")
            ax2 = axes[0].twinx()
            ax2.fill_between(t, df["throughput"], color=GRID, alpha=0.8, lw=0, zorder=0)
            ax2.set_ylabel("φορτίο (αιτ./s)", color=MUTED)
            ax2.set_ylim(0, 330)
            ax2.grid(False)
            ax2.spines["right"].set_visible(True)
            axes[0].set_zorder(ax2.get_zorder() + 1)
            axes[0].patch.set_visible(False)
    axes[0].set_ylim(0, 4.3)
    axes[0].set_yticks([1, 2, 3])
    axes[0].set_ylabel("pods")
    axes[0].legend(loc="upper left", fontsize=15, ncol=3)
    axes[1].axhline(nfr.NFR_P95, color=NFR_C, ls="--", lw=2)
    axes[1].set_ylim(0, 0.45)
    axes[1].set_ylabel("p95 στο ingress (s)")
    axes[1].set_xlabel("λεπτά")
    axes[1].set_xlim(0, 38)
    axes[1].legend(loc="upper right", fontsize=15)
    axes[0].set_title("Κανονικό φορτίο (38 λεπτά): ο agent ακολουθεί τον πίνακα, το HPA κρατά περιθώριο")
    fig.tight_layout()
    save(fig, "normal_load.png")


# --- the verification's noise ----------------------------------------------------------------------------------------
def fig_window_noise():
    """The noise each comparison of the verification is judged against (window_noise.json), with the two phases of the
    window (it grows from 20 s to a minute, then slides) and the live UNSTABLE of 2026-11-18 as the worked example
    (eval_llm_20261118_1308: score -5.29 at +20 s -> -4.95 at +50 s, a rise of 0.33 against 0.474)."""
    noise = bundle["window_noise"]
    fig, ax = plt.subplots(figsize=(11, 6.4))
    ax.axvspan(20, 60, color=FILL, alpha=0.55, lw=0, zorder=0)
    for key, color, name, verdict in [("step", AGENT, "πτώση σε 10 s (από μέτρηση σε μέτρηση)", "«χειρότερα»"),
                                      ("span", HPA, "άνοδος σε 30 s (3 μετρήσεις)", "«δεν βελτιώνεται»")]:
        xs = sorted(int(k) for k in noise[key])
        ys = [noise[key][str(x)] for x in xs]
        ax.plot(xs, ys, "-o", color=color, lw=2.5, ms=8, label=name, zorder=3)
        ax.text(xs[-1] + 3, ys[-1], verdict, color=INK, fontsize=15, va="center")
    rise, limit = -4.953 - -5.287, noise["span"]["50"]
    ax.plot([50], [rise], "D", ms=10, color=INK, zorder=4)
    ax.annotate("", xy=(50, limit - 0.01), xytext=(50, rise + 0.012),
                arrowprops=dict(arrowstyle="<->", color=INK, lw=1.5), zorder=4)
    ax.text(63, 0.435, f"18/11: άνοδος {rise:.2f} < {limit:.2f}\n→ «δεν βελτιώνεται» (UNSTABLE)",
            fontsize=15, color=INK, va="center")
    ax.text(40, 0.03, "το παράθυρο μεγαλώνει\n20 s → 1 λεπτό", ha="center", fontsize=14, color=MUTED)
    ax.text(92, 0.03, "παράθυρο 1 λεπτού, κυλά", ha="center", fontsize=14, color=MUTED)
    ax.set_xlim(18, 142)
    ax.set_xticks(range(20, 121, 20))
    ax.set_ylim(0, 0.52)
    ax.set_xlabel("δευτερόλεπτα μετά την αλλαγή")
    ax.set_ylabel("θόρυβος (μονάδες score)")
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, fontsize=15, handlelength=1.6, columnspacing=1.4)
    save(fig, "window_noise.png")


if __name__ == "__main__":
    fig_capacity()
    fig_ingress_vs_backend()
    fig_if_vs_ocsvm()
    fig_svm_map()
    fig_gamma_hills()
    fig_gamma_choice()
    fig_score_faults()
    fig_faults_timeline()
    fig_normal_load()
    fig_window_noise()
