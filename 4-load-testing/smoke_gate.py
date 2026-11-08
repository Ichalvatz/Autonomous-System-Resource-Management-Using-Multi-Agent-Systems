"""
Did the smoke runs of a new agent version go right? Exit 0 if yes (v14_finish.sh then starts the campaign), else 1.

The runs tagged TAG (results_nfr*.csv, notes = TAG, label = AGENT_LABEL, default llm-v14) must be:
  - one per scenario (baseline, stuck, cpuhog), none on battery;
  - every agent action verified STABLE, no agent run that crashed (incident_log.csv, agent_error empty);
  - the faults recovered (recovery_s present) by a restart.
With --first, the first run of each scenario is judged (the first round of a campaign, A34 2026-11-08), and the exit
code is 2 while a scenario has no run yet.
Read-only. Usage (repo root):  .venv/bin/python3 4-load-testing/smoke_gate.py smoke-v14-2026-11-07
                               .venv/bin/python3 4-load-testing/smoke_gate.py --first campaign-v14-2026-11-08
"""
import csv
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LT = os.path.join(ROOT, "4-load-testing")
STAMP = "%Y-%m-%d %H:%M:%S"
LABEL = os.getenv("AGENT_LABEL", "llm-v14")
SCENARIOS = {"baseline": "results_nfr.csv", "stuck": "results_nfr_stuck.csv", "cpuhog": "results_nfr_cpuhog.csv"}


def read(path):
    return list(csv.DictReader(open(path))) if os.path.exists(path) else []


def main(tag, first=False):
    incidents = read(os.path.join(ROOT, "3-ai-agent", "incident_log.csv"))
    problems, missing = [], []
    for scenario, name in SCENARIOS.items():
        runs = [r for r in read(os.path.join(LT, name)) if r["notes"] == tag and r["label"] == LABEL]
        if first and not runs:
            missing.append(scenario)
            continue
        if first:
            runs = [min(runs, key=lambda r: r["start"])]
        if len(runs) != 1:
            problems.append(f"{scenario}: {len(runs)} runs tagged {tag} (expected 1)")
            continue
        run = runs[0]
        start, end = datetime.strptime(run["start"], STAMP), datetime.strptime(run["end"], STAMP)
        inc = [i for i in incidents if start <= datetime.strptime(i["woke_at"], STAMP) <= end]
        acted = [i for i in inc if i["actions"]]
        line = (f"{scenario}: {len(inc)} wake-ups, actions "
                f"{'; '.join(i['woke_at'][11:] + ' ' + i['actions'] + ' (' + i['verification'] + ')' for i in acted) or 'none'}"
                f", fenced replies {sum(int(i.get('llm_fenced') or 0) for i in inc)}")
        if scenario != "baseline":
            line += f", recovery {run.get('recovery_s') or 'none'} s"
        print(line)
        if float(run.get("on_battery_s") or 0) > 0:
            problems.append(f"{scenario}: {run['on_battery_s']} s on battery")
        if not acted:
            problems.append(f"{scenario}: no agent action")
        problems += [f"{scenario} {i['woke_at'][11:]}: {i['actions']} not STABLE ({i['verification']})"
                     for i in acted if i["verification"] != "STABLE"]
        problems += [f"{scenario} {i['woke_at'][11:]}: agent error {i['agent_error'][:100]}" for i in inc if i["agent_error"]]
        if scenario != "baseline":
            if not run.get("recovery_s"):
                problems.append(f"{scenario}: did not recover")
            if not any("restart" in i["actions"] for i in acted):
                problems.append(f"{scenario}: no restart")
    for p in problems:
        print("PROBLEM:", p)
    if problems or not missing:
        print("smoke gate:", "pass" if not problems else "FAIL")
        return 0 if not problems else 1
    print(f"smoke gate: waiting for the first run of {', '.join(missing)}")
    return 2


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--first"]
    sys.exit(main(args[0], first="--first" in sys.argv))
