"""
Report of one experiment campaign (full_campaign.sh), phase 2 (2026-10-22): every run whose notes column is the
campaign TAG, per scenario and method (the agent, label AGENT_LABEL, default llm-v14; llm-v12 for campaign-2026-11-01; HPA), with the checks that say
whether the agent did the right thing.

Usage (from repo root):
    [AGENT_LABEL=llm-v9] .venv/bin/python3 4-load-testing/campaign_report.py <TAG> > 4-load-testing/<TAG>.md

Reads 4-load-testing/results_nfr*.csv (one row per run), 3-ai-agent/incident_log.csv (one row per agent wake-up),
each run's controller.log (guard refusals) and the campaign log (provenance hashes). The checks, per agent run:
  normal load  the replica count went 1->2->3->2->1 (4 changes) and every applied action was verified STABLE;
               the NFR violation is reported, not judged (in an open-model load every strategy pays for the
               time a scale-up takes)
  stuck        the first wake-up after the fault restarts the app and is verified STABLE; the NFRs recover
               (a wake-up before the fault is listed as a false wake, with what the agent did about it)
  cpuhog       the same
A run decided partly by the fallback model is flagged: that is a different agent. A wake-up in the controller log
with no incident_log row (the agent was still running when the run ended, e.g. a stalled LLM call) is flagged too.
(Phase 1's version, with rules / static / badconfig and the v8 comparison: git tag v8.1-campaign.)
"""
import csv
import hashlib
import os
import re
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INCIDENTS = os.path.join(ROOT, "3-ai-agent", "incident_log.csv")
AGENT = os.environ.get("AGENT_LABEL", "llm-v14")
METHODS = [AGENT, "hpa"]
# scenario, results CSV, right action (regex on the incident's actions), recovery column, Greek name
SCENARIOS = [
    ("baseline", "results_nfr.csv", None, None, "Κανονικό φορτίο"),
    ("stuck", "results_nfr_stuck.csv", r"\brestart\b", "recovery_s", "Stuck"),
    ("cpuhog", "results_nfr_cpuhog.csv", r"\brestart\b", "recovery_s", "Cpuhog"),
]
RIGHT_ACTION = {"baseline": "1→2→3→2→1", "stuck": "restart", "cpuhog": "restart"}
STAMP = "%Y-%m-%d %H:%M:%S"


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def incidents_in(row, incidents):
    start, end = datetime.strptime(row["start"], STAMP), datetime.strptime(row["end"], STAMP)
    return [i for i in incidents if start <= datetime.strptime(i["woke_at"], STAMP) <= end]


def refusals(row):
    """Guard refusals the LLM saw in this run (each refusal text appears in the controller log)."""
    path = os.path.join(ROOT, row.get("run_dir") or "", "controller.log")
    if not row.get("run_dir") or not os.path.exists(path):
        return None
    text = open(path, errors="replace").read()
    return {"evidence": text.count("Refused (evidence before action)"),
            "diagnosis": text.count("Refused (diagnosis first)"),
            "claim": text.count("Refused: no action tool was executed")}


def unlogged_wakes(row, inc):
    """Wake-ups in the controller log with no incident_log row, each with the number of LLM warnings after it."""
    path = os.path.join(ROOT, row.get("run_dir") or "", "controller.log")
    if not row.get("run_dir") or not os.path.exists(path):
        return []
    logged = {i["woke_at"][11:] for i in inc}
    lines = open(path, errors="replace").read().splitlines()
    wakes = [(n, m.group(1)) for n, line in enumerate(lines)
             if (m := re.match(r"\[(\d\d:\d\d:\d\d)\] ANOMALY DETECTED", line))]
    return [(t, sum("[LLM]" in line for line in lines[n:])) for n, t in wakes if t not in logged]


def fault_time(row):
    if not row.get("fault_at_min"):
        return None
    return datetime.fromtimestamp(datetime.strptime(row["start"], STAMP).timestamp() + 60 * float(row["fault_at_min"]))


def mean(values):
    nums = [float(v) for v in values if v not in ("", "never", None)]
    return f"{sum(nums) / len(nums):.0f}" if nums else "–"


def agent_checks(scenario, right, rec_col, row, inc):
    """(first wake-up right, recovered, notes) for one agent run."""
    acted = [i for i in inc if i["actions"]]
    notes = []
    if sum(int(i["llm_fallback_calls"] or 0) for i in inc):
        notes.append("⚠ fallback model")
    if any(i["agent_error"] for i in inc):
        notes.append("⚠ agent error")
    if any(i.get("rewake") == "True" for i in inc):
        notes.append("ξαναξύπνημα")
    if row.get("on_battery_s") not in (None, "", "0"):
        notes.append(f"⚠ μπαταρία {row['on_battery_s']} s")
    if scenario == "baseline":
        stable = all(i["verification"] == "STABLE" for i in acted)
        path = [c.strip().split(" ")[1] for c in (row.get("replica_changes") or "").replace(" | ", ", ").split(", ") if c]
        ok = stable and path == ["1->2", "2->3", "3->2", "2->1"]
        if not stable:
            notes.append("μη STABLE ενέργεια")
        return ok, stable, notes
    fault = fault_time(row)
    before = [i for i in inc if fault and datetime.strptime(i["woke_at"], STAMP) < fault]
    after = [i for i in inc if i not in before]
    for i in before:
        notes.append(f"αφύπνιση πριν το fault ({i['woke_at'][11:]}: {i['actions'] or 'καμία ενέργεια'})")
    for t, warnings in unlogged_wakes(row, inc):
        notes.append(f"⚠ αφύπνιση {t} χωρίς ολοκληρωμένο run του agent ({warnings} προειδοποιήσεις LLM)")
    first = after[0] if after else None
    ok = bool(first and re.search(right, first["actions"] or "") and first["verification"] == "STABLE")
    if first is None and not unlogged_wakes(row, inc):
        notes.append("καμία αφύπνιση")
    return ok, row.get(rec_col, "never") not in ("never", "", None), notes


def provenance(tag):
    log = os.path.join(HERE, f"{tag}.log")
    if not os.path.exists(log):
        return ["(δεν βρέθηκε το log της καμπάνιας)"]
    lines, changed = [], []
    for line in open(log):
        m = re.match(r"([0-9a-f]{64})  (.+)$", line.strip())
        if m:
            path = os.path.join(ROOT, m.group(2))
            now = hashlib.sha256(open(path, "rb").read()).hexdigest() if os.path.exists(path) else "missing"
            if now != m.group(1):
                changed.append(m.group(2))
        elif "campaign " in line or "git HEAD" in line or "all runs done" in line or "unavailable after" in line:
            lines.append(line.strip())
    lines.append("Κώδικας, μοντέλο και φορτίο αμετάβλητα από την αρχή ως τώρα: "
                 + ("ναι (ίδια sha256)" if not changed else "**ΟΧΙ**, άλλαξαν: " + ", ".join(changed)))
    return lines


def main():
    tag = sys.argv[1]
    incidents = read_csv(INCIDENTS)
    out = [f"# Καμπάνια {tag}", "", f"*Αναφορά από `campaign_report.py`, {datetime.now():%Y-%m-%d %H:%M}.*", ""]
    out += ["## Προέλευση", ""] + [f"- {line}" for line in provenance(tag)] + [""]

    summary = ["## Έλυσε ο agent κάθε σενάριο;", "",
               "| Σενάριο | Σωστή ενέργεια | Runs | Σωστά στην 1η αφύπνιση (μετά το fault) | Ανέκαμψε | Μέσος χρόνος ανάκαμψης (s) | Σημειώσεις |",
               "|---|---|---|---|---|---|---|"]
    details, agent_runs, problems = [], [], []
    for scenario, csv_name, right, rec_col, title in SCENARIOS:
        rows = [r for r in read_csv(os.path.join(HERE, csv_name)) if r.get("notes") == tag]
        if not rows:
            continue
        by_method = {m: [r for r in rows if r["label"] == m] for m in METHODS}
        problems += [f"- Άκυρο, εκτός πινάκων: {title} {r['label']} {r['start']} ({r.get('run_dir', '')})"
                     for r in rows if "INVALID" in r["label"]]
        problems += [f"- ⚠ Μπαταρία {r['on_battery_s']} s στο run: {title} {r['label']} {r['start']} ({r.get('run_dir', '')})"
                     for r in rows if r.get("on_battery_s") not in (None, "", "0") and "INVALID" not in r["label"]]
        details += [f"## {title}", ""]
        if scenario == "baseline":
            details += ["| Μέθοδος | Runs | Παραβίαση NFR (s) | Σφάλματα (%) | replica-min | Σωστή προμήθεια (%) | Αλλαγές pods | Liveness restarts |",
                        "|---|---|---|---|---|---|---|---|"]
            for m, rs in by_method.items():
                if rs:
                    details.append(f"| {m} | {len(rs)} | {' / '.join(r['nfr_violation_s'] for r in rs)} | "
                                   f"{' / '.join(r['errors_pct'] for r in rs)} | "
                                   f"{' / '.join(r['replica_minutes'] for r in rs)} | "
                                   f"{' / '.join(r['correct_prov_pct'] for r in rs)} | "
                                   f"{' ‖ '.join((r.get('replica_changes') or '–').replace(' | ', ', ') for r in rs)} | "
                                   f"{' / '.join(r.get('liveness_restarts', '') for r in rs)} |")
        else:
            details += ["| Μέθοδος | Runs | Ανάκαμψη (s) | Παραβίαση NFR μετά το fault (s) | Σφάλματα (%) | Max pods | replica-min | Liveness restarts | Ενέργειες |",
                        "|---|---|---|---|---|---|---|---|---|"]
            for m, rs in by_method.items():
                if rs:
                    acts = " ‖ ".join((r.get("agent_actions") or r.get("replica_changes") or "καμία").replace(" | ", "; ")
                                      for r in rs)
                    details.append(f"| {m} | {len(rs)} | {' / '.join(r['recovery_s'] for r in rs)} | "
                                   f"{' / '.join(r['nfr_violation_after_fault_s'] for r in rs)} | "
                                   f"{' / '.join(r['errors_pct'] for r in rs)} | "
                                   f"{' / '.join(r['max_replicas_after_fault'] for r in rs)} | "
                                   f"{' / '.join(r['replica_minutes'] for r in rs)} | "
                                   f"{' / '.join(r.get('liveness_restarts', '') for r in rs)} | {acts} |")
        details.append("")

        agent = by_method[AGENT]
        if agent:
            checks = [agent_checks(scenario, right, rec_col, r, incidents_in(r, incidents)) for r in agent]
            notes = sorted({re.sub(r" \(.*", "", n) for _, _, ns in checks for n in ns})
            rec_times = [r["recovery_s"] for r in agent] if scenario != "baseline" else []
            summary.append(f"| {title} | {RIGHT_ACTION[scenario]} | {len(agent)} | {sum(c[0] for c in checks)}/{len(agent)} | "
                           f"{sum(c[1] for c in checks)}/{len(agent)} | {mean(rec_times) if rec_times else '–'} | "
                           f"{', '.join(notes) or '–'} |")
            for r, c in zip(agent, checks):
                agent_runs.append((title, r, c))
                if not (c[0] and c[1]) or c[2]:
                    problems.append(f"- {title} {r['start']}: σωστό στην 1η αφύπνιση{' (μετά το fault)' if rec_col else ''} {c[0]}, ανέκαμψε {c[1]}, "
                                    f"{', '.join(c[2]) or '–'} (`{r.get('run_dir', '')}`)")

    out += summary + [""] + details
    out += ["## Τα runs του agent ένα ένα", ""]
    for title, r, c in agent_runs:
        ref = refusals(r)
        ref_txt = (f"φραγμοί: evidence {ref['evidence']}, diagnosis {ref['diagnosis']}, claim {ref['claim']}"
                   if ref else "φραγμοί: –")
        out += [f"### {title}, {r['start']} (`{r.get('run_dir', '')}`)", "",
                f"Σωστά στην 1η αφύπνιση{' μετά το fault' if fault_time(r) else ''}: **{'ναι' if c[0] else 'όχι'}** · "
                f"ανέκαμψε: **{'ναι' if c[1] else 'όχι'}** · {ref_txt}", ""]
        for t, warnings in unlogged_wakes(r, incidents_in(r, incidents)):
            out.append(f"- {t} αφύπνιση χωρίς γραμμή στο incident_log: ο agent έτρεχε ακόμα στο τέλος του run "
                       f"({warnings} προειδοποιήσεις [LLM] στο controller.log μετά από αυτήν)")
        for i in incidents_in(r, read_csv(INCIDENTS)):
            answer = (i["final_answer"] or "").replace("\n", " ").replace("|", "/")[:220]
            out.append(f"- {i['woke_at'][11:]} `{i['signature'].replace('State -> ', '')}` → "
                       f"**{i['actions'] or 'καμία ενέργεια'}** ({i.get('verification_detail') or i['verification'] or '–'}); "
                       f"LLM calls {i['llm_calls']}, retries {i['llm_retries']}, fallback {i['llm_fallback_calls']}, "
                       f"agent {i['agent_seconds']} s, σύνολο {i['total_seconds']} s"
                       f"{'; error: ' + i['agent_error'][:120] if i['agent_error'] else ''}")
            if answer:
                out.append(f"  - «{answer}»")
        out.append("")

    out += ["## Τι να κοιτάξεις", ""] + (problems or [
        "- Τίποτα: κάθε run του agent πέρασε όλους τους ελέγχους." if agent_runs
        else "- Δεν έχει τρέξει ακόμα κανένα run του agent."])
    out += ["", "Όλοι οι πίνακες με μέσους όρους και τα στατιστικά: `4-load-testing/comparison_nfr.md`."]
    print("\n".join(out))


if __name__ == "__main__":
    main()
