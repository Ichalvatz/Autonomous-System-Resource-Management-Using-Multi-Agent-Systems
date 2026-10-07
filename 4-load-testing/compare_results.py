"""
Thesis comparison of scaling strategies.

Reads 4-load-testing/evaluation_results.csv (one row per run, written by
evaluate_run.py) and writes:
  4-load-testing/comparison.md              mean ± std per strategy
  4-load-testing/comparison_timelines.png   desired replicas, load and p95 per run

Usage (from repo root):  python 4-load-testing/compare_results.py
"""
import glob
import os
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from evaluate_run import QUERIES, SLO_P95, fetch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "evaluation_results.csv")
ORDER = ["static-1", "static-3", "hpa", "rules", "rules-v2", "llm-v3", "llm-nomem", "llm", "llm-v5", "llm-v6", "llm-v7", "llm-v8"]
COLUMNS = [
    ("slo_violation_s", "SLO violation (s, p95 > 0.35 s)"),
    ("pressure_s", "Pressure (s, CPU > 0.75 or throttling > 5%)"),
    ("p95_mean", "p95 mean (s)"),
    ("replica_minutes", "Replica-minutes (cost)"),
    ("correct_prov_pct", "Correct provisioning (%)"),
    ("under_prov_s", "Under-provisioned (s)"),
    ("over_prov_s", "Over-provisioned (s)"),
    ("scale_actions", "Scale actions"),
    ("llm_calls", "LLM calls"),
]


STUCK_COLUMNS = [
    ("recovery_s", "Recovery after fault (s; p95 < 0.35 s held 60 s)"),
    ("cpu_recovery_s", "Fault gone after (s; CPU per request ≤ 0.10 held 60 s)"),
    ("slo_violation_after_fault_s", "SLO violation after fault (s)"),
    ("max_replicas_after_fault", "Max replicas after fault"),
    ("k6_p95_s", "User-side p95 over the whole run (s, k6)"),
    ("k6_requests", "Logins completed (k6; closed loop: fewer = users slowed)"),
    ("replica_minutes", "Replica-minutes (cost)"),
    ("scale_actions", "Scale actions"),
    ("incidents", "Agent incidents"),
    ("stable", "Verified STABLE"),
    ("llm_calls", "LLM calls"),
]


def table(df, columns=COLUMNS):
    labels = [l for l in ORDER if l in set(df["label"])] + sorted(set(df["label"]) - set(ORDER))
    lines = ["| Metric | " + " | ".join(f"{l} (n={int((df['label'] == l).sum())})" for l in labels) + " |",
             "|---|" + "---|" * len(labels)]
    for col, name in columns:
        cells = []
        for l in labels:
            raw = df.loc[df["label"] == l, col] if col in df else pd.Series(dtype=object)
            never = int((raw.astype(str) == "never").sum())
            v = pd.to_numeric(raw, errors="coerce").dropna()
            if never:
                cells.append(f"never ({never}/{len(raw)})" + (f", else {v.mean():.3g}" if len(v) else ""))
            elif v.empty:
                cells.append("–")
            elif len(v) == 1:
                cells.append(f"{v.iloc[0]:g}")
            else:
                cells.append(f"{v.mean():.3g} ± {v.std():.2g}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def timelines(df, out_name="comparison_timelines.png", stuck=False):
    runs = df.reset_index(drop=True)
    fig, axes = plt.subplots(len(runs), 1, figsize=(11, 2.3 * len(runs)), sharex=True, squeeze=False)
    for i, r in runs.iterrows():
        start = datetime.strptime(r["start"], "%Y-%m-%d %H:%M:%S").timestamp()
        end = datetime.strptime(r["end"], "%Y-%m-%d %H:%M:%S").timestamp()
        s = {k: fetch(QUERIES[k], start, end) for k in ["desired_replicas", "throughput", "latency_p95"]}
        ax = axes[i][0]
        t = sorted(s["desired_replicas"])
        minutes = [(x - start) / 60 for x in t]
        ax.step(minutes, [s["desired_replicas"][x] for x in t], where="post", color="#1f4e79", lw=2, label="replicas")
        ax.set_ylim(0, 3.6)
        ax.set_yticks([1, 2, 3])
        ax.set_ylabel("replicas")
        ax2 = ax.twinx()
        tr = sorted(s["throughput"])
        ax2.plot([(x - start) / 60 for x in tr], [s["throughput"][x] for x in tr], color="#8a8a8a", lw=1, label="rps")
        ax2.set_ylim(0, 35)
        ax2.set_ylabel("rps")
        bad = [(x - start) / 60 for x, v in s["latency_p95"].items() if v == v and v > SLO_P95]
        for b in bad:
            ax.axvspan(b, b + 10 / 60, color="#d62728", alpha=0.25, lw=0)
        if stuck:
            ax.axvline(float(r["fault_at_min"]), color="black", ls="--", lw=1)
            ax2.set_ylim(0, 12)
            ax.set_title(f"{r['label']}  ({r['start'][5:16]})  fault at {r['fault_at_min']} min, recovery "
                         f"{r['recovery_s']} s, max {r['max_replicas_after_fault']} replicas", fontsize=9, loc="left")
        else:
            ax.set_title(f"{r['label']}  ({r['start'][5:16]})  SLO violation {r['slo_violation_s']} s, "
                         f"{r['replica_minutes']} replica-min, {r['correct_prov_pct']}% correct", fontsize=9, loc="left")
    axes[-1][0].set_xlabel("minutes since load start (red = p95 > 0.35 s" + (", dashed = fault)" if stuck else ")"))
    fig.tight_layout()
    out = os.path.join(HERE, out_name)
    fig.savefig(out, dpi=110)
    return out


FAULTS = [
    # (csv, timeline png, heading, explanation)
    ("evaluation_results_stuck.csv", "comparison_stuck_timelines.png",
     "Stuck-dependency fault (fault_load.js, 8 VUs; POST /chaos/stuck at t = 4 min)",
     "Only a restart fixes the fault; adding replicas dilutes it."),
    ("evaluation_results_cpuhog.csv", "comparison_cpuhog_timelines.png",
     "Runaway background job (fault_load.js, 8 VUs; POST /chaos/cpuhog at t = 4 min)",
     "Blind test: designed after prompt v4 was frozen. Looks like CPU overload (CPU ~0.9, throttling ~18%) "
     "at a third of the capacity rps; only a restart fixes it. **The server-side p95 rows are not meaningful here**: "
     "the app's histogram does not time requests queued behind a blocked event loop, so once the hogged pods "
     "get few requests the server p95 looks healthy while users wait. Judge by \"Fault gone after\" and the k6 rows."),
    ("evaluation_results_badconfig.csv", "comparison_badconfig_timelines.png",
     "Bad configuration change (fault_load.js, 8 VUs; FEATURE_LOGIN_AUDIT=true deployed at t = 4 min)",
     "Blind test for prompt v6: designed after v6 was frozen (2026-10-03 14:28). Every login runs a synchronous "
     "PBKDF2 (1.5M iterations, ~0.35 s of CPU per login), so CPU per request rises ~5x in EVERY pod and no "
     "replica count meets the p95 objective. The bad state lives in the "
     "deployment's configuration: restarts and new pods do not help, only a rollback does. Server-side p95 is "
     "meaningful here (the extra work runs inside the handler)."),
]
INCIDENTS = os.path.join(os.path.dirname(HERE), "3-ai-agent", "incident_log.csv")


def exact_permutation_p(a, b):
    """One-sided exact permutation test that mean(a) < mean(b): the share of all ways to split
    the pooled runs into groups of len(a) / len(b) whose mean difference is at least as extreme.
    With n = 2-5 per group no normal approximation is trustworthy, so enumerate every split."""
    from itertools import combinations
    pooled = list(a) + list(b)
    observed = sum(a) / len(a) - sum(b) / len(b)
    total = extreme = 0
    for idx in combinations(range(len(pooled)), len(a)):
        ga = [pooled[i] for i in idx]
        gb = [pooled[i] for i in range(len(pooled)) if i not in idx]
        total += 1
        extreme += (sum(ga) / len(ga) - sum(gb) / len(gb)) <= observed + 1e-9
    return extreme / total


def statistics(df, faults):
    """Significance of the headline claims (small n: exact tests only)."""
    from scipy.stats import fisher_exact
    lines = ["# Statistics (exact tests; small n)", ""]
    llm_cost = df.loc[df["label"].isin(["llm", "llm-v3"]), "replica_minutes"].astype(float).tolist()
    # Final version alone, and every LLM version with the v4-style capacity tiers (v3, v4, v7, v8) pooled,
    # against HPA and against the rule scaler (rules and rules-v2 share the same scaling rules).
    final_cost = df.loc[df["label"] == "llm-v8", "replica_minutes"].astype(float).tolist()
    tiers_cost = df.loc[df["label"].isin(["llm", "llm-v3", "llm-v7", "llm-v8"]), "replica_minutes"].astype(float).tolist()
    rules_cost = df.loc[df["label"].isin(["rules", "rules-v2"]), "replica_minutes"].astype(float).tolist()
    hpa_cost = df.loc[df["label"] == "hpa", "replica_minutes"].astype(float).tolist()
    for name, a in [("LLM v8 (final)", final_cost), ("LLM v3+v4+v7+v8", tiers_cost)]:
        for other, b in [("hpa", hpa_cost), ("rules+rules-v2", rules_cost)]:
            if len(a) >= 2 and b:
                lines.append(f"- Scaling, replica-minutes, {name} (n={len(a)}, mean {sum(a)/len(a):.1f}) < {other} "
                             f"(n={len(b)}, mean {sum(b)/len(b):.1f}): one-sided exact permutation p = {exact_permutation_p(a, b):.3f}")
    for other in ["hpa", "rules", "static-3"]:
        b = df.loc[df["label"] == other, "replica_minutes"].astype(float).tolist()
        if llm_cost and b:
            lines.append(f"- Scaling, replica-minutes, LLM v3+v4 (n={len(llm_cost)}, mean {sum(llm_cost)/len(llm_cost):.1f}) "
                         f"< {other} (n={len(b)}, mean {sum(b)/len(b):.1f}): one-sided exact permutation "
                         f"p = {exact_permutation_p(llm_cost, b):.3f}")
    for name, st in faults:
        # cpuhog: the server-side p95 cannot see the fault, so "recovered" = the hog is gone.
        col = "cpu_recovery_s" if "cpu_recovery_s" in st and st["cpu_recovery_s"].notna().all() else "recovery_s"
        rec = st[col].astype(str) != "never"
        is_llm = st["label"].str.startswith("llm")
        table_ = [[int((rec & is_llm).sum()), int((~rec & is_llm).sum())],
                  [int((rec & ~is_llm).sum()), int((~rec & ~is_llm).sum())]]
        if table_[0] != [0, 0] and table_[1] != [0, 0]:
            p = fisher_exact(table_, alternative="greater").pvalue
            lines.append(f"- {name} ({col}): recovered, all LLM versions {table_[0][0]}/{sum(table_[0])} vs baselines "
                         f"{table_[1][0]}/{sum(table_[1])}: one-sided Fisher exact p = {p:.4f}")
        # The tool-using agents pooled (v6 and v7 share the same tools) against all baselines pooled.
        tools = st["label"].isin(["llm-v6", "llm-v7", "llm-v8"])
        if tools.any() and (~is_llm).any():
            t = [[int((rec & tools).sum()), int((~rec & tools).sum())],
                 [int((rec & ~is_llm).sum()), int((~rec & ~is_llm).sum())]]
            p = fisher_exact(t, alternative="greater").pvalue
            lines.append(f"  - tool-using agents (v6+v7+v8) {t[0][0]}/{sum(t[0])} vs all baselines {t[1][0]}/{sum(t[1])}: "
                         f"Fisher p = {p:.4f}")
        # The tool-using agents (v6 = blind-tested, v8 = final) against each baseline separately.
        for agent_label in ["llm-v6", "llm-v8"]:
            ag = st["label"] == agent_label
            if not ag.any():
                continue
            for other in [l for l in ["rules-v2", "rules", "hpa", "static-1"] if (st["label"] == l).any()]:
                o = st["label"] == other
                t = [[int((rec & ag).sum()), int((~rec & ag).sum())], [int((rec & o).sum()), int((~rec & o).sum())]]
                p = fisher_exact(t, alternative="greater").pvalue
                lines.append(f"  - {agent_label} {t[0][0]}/{sum(t[0])} vs {other} {t[1][0]}/{sum(t[1])}: Fisher p = {p:.3f}")
    lines += ["", "Pooling LLM v3 and v4 on the scaling load is justified by their identical results there "
              "(71.5-71.8 replica-min); on the fault runs every LLM version is pooled against every baseline.", ""]
    return lines


def k6_user_view(start):
    """User-side latency for the run that started at `start`, from its k6 summary.

    Needed for the cpuhog fault: the backend's histogram starts timing when the handler
    runs, so time spent queued behind a blocked event loop is invisible to the server-side
    p95, while users feel all of it. Closed loop: fewer completed logins = users slowed."""
    import re
    for window in glob.glob(os.path.join(HERE, "eval_*", "window.txt")):
        with open(window) as f:
            if f.readline().strip() != start:
                continue
        k6_log = os.path.join(os.path.dirname(window), "k6.log")
        if not os.path.exists(k6_log):
            return {}
        text = open(k6_log).read()
        dur = re.search(r"http_req_duration\.*: avg=([\d.]+)(ms|s) .*p\(95\)=([\d.]+)(ms|s)", text)
        reqs = re.search(r"http_reqs\.*: (\d+)", text)
        to_s = lambda v, unit: float(v) / (1000 if unit == "ms" else 1)
        out = {}
        if dur:
            out["k6_avg_s"] = round(to_s(dur.group(1), dur.group(2)), 3)
            out["k6_p95_s"] = round(to_s(dur.group(3), dur.group(4)), 3)
        if reqs:
            out["k6_requests"] = int(reqs.group(1))
        return out
    return {}


def agent_actions(row, incidents):
    """Actions of every agent run inside this experiment window, in order."""
    start = pd.Timestamp(row["start"])
    end = pd.Timestamp(row["end"])
    inside = incidents[(incidents["woke_at"] >= start) & (incidents["woke_at"] <= end)]
    return " | ".join(f"{a if isinstance(a, str) and a else 'none'} ({v})"
                      for a, v in zip(inside["actions"], inside["verification"].fillna("")))


def main():
    df = pd.read_csv(RESULTS)
    df = df[~df["label"].str.contains("INVALID")]  # contaminated runs stay in the CSV for the record
    md = ["# Scaling strategy comparison (baseline.js, 5→20→30→14→5 VUs)", "",
          f"Generated {datetime.now():%Y-%m-%d %H:%M} from `evaluation_results.csv` ({len(df)} runs).", "",
          table(df), "",
          "Lower is better except correct provisioning. `llm` rows with notes mentioning an older agent version are",
          "kept for history; see the notes column in the CSV.", ""]
    incidents = pd.read_csv(INCIDENTS, parse_dates=["woke_at"]) if os.path.exists(INCIDENTS) else None
    fault_frames = []
    for csv_name, png, heading, explanation in FAULTS:
        path = os.path.join(HERE, csv_name)
        if not os.path.exists(path):
            continue
        st = pd.read_csv(path)
        st = st[~st["label"].str.contains("INVALID")].reset_index(drop=True)
        user = pd.DataFrame([k6_user_view(r) for r in st["start"]])
        for col in ["k6_p95_s", "k6_avg_s", "k6_requests"]:
            st[col] = user[col] if col in user else None
        md += [f"# {heading}", "", f"{len(st)} runs from `{csv_name}`. {explanation}", "",
               table(st, STUCK_COLUMNS), ""]
        if incidents is not None:
            llm_runs = st[st["label"].str.startswith("llm")]
            if len(llm_runs):
                md += ["Agent actions per run (each agent wake-up, with its verification verdict):", ""]
                md += [f"- {r['label']} {r['start'][5:16]}: recovery {r['recovery_s']} s; "
                       f"{agent_actions(r, incidents) or 'no wake-up'}" for _, r in llm_runs.iterrows()]
                md.append("")
        if "rule_actions" in st:
            rule_runs = st[st["label"].str.startswith("rules") & st["rule_actions"].notna()]
            if len(rule_runs):
                md += ["Rule-based actions per run (from the controller log):", ""]
                md += [f"- {r['label']} {r['start'][5:16]}: recovery {r['recovery_s']} s; {r['rule_actions'] or 'none'}"
                       for _, r in rule_runs.iterrows()]
                md.append("")
        fault_frames.append((st, png, heading.split(" (")[0]))
    md += statistics(df, [(name, st) for st, _, name in fault_frames])
    with open(os.path.join(HERE, "comparison.md"), "w") as f:
        f.write("\n".join(md))
    print("\n".join(md))
    print("timelines:", timelines(df))
    for st, png, _ in fault_frames:
        if len(st):
            print("fault timelines:", timelines(st, png, stuck=True))


if __name__ == "__main__":
    main()
