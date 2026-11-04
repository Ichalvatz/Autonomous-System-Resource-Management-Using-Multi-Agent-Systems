"""
Prompt evaluation of agent v14 (design_decisions.md A33, 2026-11-03): v13's prompt against v14's, with the real LLM, on
the wake-ups recorded since the current health model (v12's, 2026-11-01): the campaign of 1-2/11, the smoke runs of 1/11
and 3/11 and the UNSTABLE test of 1/11 (47 wake-ups; one left out, below).

Each case is one recorded wake-up, rebuilt from its run's controller.log:
  - the reading the detector sent (the JSON in the logged prompt), the memory lookup and the recent actions as they were;
  - the three observation tools answer with what they answered at the time (the first output of each tool in that
    wake-up; if the agent did not call a tool then, the output of the same tool at the nearest wake-up of the same run,
    else a note that the tool returned nothing; the report counts both);
  - the action tools are the real ones (guards, limits, cooldowns) against a mocked cluster at the recorded pod count.
Both prompts get the same inputs: v13's (archive/prompt_v13/prompt_v13.py: one task text on smolagents' default system
prompt, <code> tags) and v14's (agent.make_sre_agent and agent.incident_message). The facts are computed with the
current health model for both (the same as logged for these runs).

The right action of a case:
  - stuck or cpuhog, after the fault and before a restart verified STABLE: restart;
  - else, when the facts' minimum pod count differs from the current one and every pod is ready: scale to the minimum;
  - else no action (the slowdowns of the ingress, 1-2/11);
  - the UNSTABLE test (load 280 rps, above what 3 pods serve), by hand: 16:51:20 scale to 3, 16:52:35 and 16:55:12 no
    action (at the ceiling, nothing helps), 16:58:26 scale to 1. Left out: 16:50:32, where the 1 m window showed 61 rps
    of an actual 280 and the pod was not ready; neither action is right on that evidence.

Criteria, declared before the first run (A33): v14 passes if, over the runs that used only the primary model,
  1. its right-action rate is at least v13's;
  2. it has no code-format failure (a step that fails to parse or runs a stray "python" line);
  3. its median number of LLM steps is not above v13's;
  4. it never restarts in a case whose right action is not a restart, where v13 never did either.

Usage (repo root):  .venv/bin/python3 4-load-testing/prompt_eval.py [--reps 3]        # runs, resumable
                    .venv/bin/python3 4-load-testing/prompt_eval.py --cases           # list the cases only
                    .venv/bin/python3 4-load-testing/prompt_eval.py --report > 4-load-testing/prompt_eval.md
One line per run in prompt_eval_results.jsonl (a run already there is not repeated). GEMINI_API_KEY from the
environment or the root .env (llm_ready.load_key; never printed).
"""
import argparse
import copy
import glob
import json
import os
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LT = os.path.join(ROOT, "4-load-testing")
sys.path[:0] = [os.path.join(ROOT, "3-ai-agent"), LT, os.path.join(LT, "archive", "prompt_v13")]
import llm_ready  # noqa: E402

llm_ready.load_key()
import agent  # noqa: E402
import agent_tools  # noqa: E402
import prompt_v13  # noqa: E402
from smolagents import CodeAgent  # noqa: E402
from smolagents.models import RateLimiter  # noqa: E402

# Pacing (from 2026-11-04 12:00, A33): the key is on Gemini's free tier (~15 requests per minute), and back-to-back runs
# went over it, so 429s cost retries and runs. Both prompts are paced the same, one call per 5 s at most; a run's
# "seconds" includes the pacing (the runs before 12:00 were not paced).
agent.model.rate_limiter = RateLimiter(12)

RESULTS = os.path.join(LT, "prompt_eval_results.jsonl")
DRAFT = "v14-draft1"   # the first draft of v14's prompt, its runs kept under this label (A33)
LAG = "v14-lag"        # v14 with get_pod_breakdown's healthy event-loop lag reference, on the non-capacity cases (A33)
CASES = os.path.join(LT, "prompt_eval_cases.json")
OBSERVE = ["get_pod_breakdown", "get_deployment_history", "get_kubernetes_logs"]
FAULT_AT_S = 240
UNSTABLE_TEST = {"16:51:20": "scale 3", "16:52:35": "none", "16:55:12": "none", "16:58:26": "scale 1"}
LEFT_OUT = {"16:50:32": "the 1 m window showed 61 rps of an actual 280 and the pod was not ready"}


# ---------------------------------------------------------------- the cases, from the controller logs

def _box(lines):
    """The text of a rich panel, one string per printed line, without the borders."""
    return [re.sub(r"^│ ?", "", l).rstrip().rstrip("│").rstrip() for l in lines]


def _unwrap(lines, starts=("- ", "    ", "[20", "---", "Deployment ", "No ", "Out:")):
    """Rejoin lines rich wrapped at 80 columns: a line continues the previous one unless it starts a new item."""
    out = []
    for l in (l.rstrip() for l in lines):
        if out and len(out[-1]) >= 70 and not l.startswith(starts):
            out[-1] += " " + l
        else:
            out.append(l)
    return out


def _tool_outputs(section):
    """{tool: output} of the first call of each observation tool alone in a code block."""
    outs, i = {}, 0
    while i < len(section):
        if "Executing parsed code:" not in section[i]:
            i += 1
            continue
        j = i + 1
        while j < len(section) and not section[j].startswith(" ─────"):
            j += 1
        code = "\n".join(l.strip() for l in section[i + 1:j] if l.strip() and not l.strip().startswith("#"))
        called = [t for t in OBSERVE if t + "(" in code]
        k = j + 1
        while k < len(section) and not section[k].startswith("[Step "):
            k += 1
        body = section[j + 1:k]
        if len(called) == 1 and "kubernetes_deployment(" not in code and "final_answer" not in code and body:
            if body[0].startswith("Execution logs:"):
                end = next((n for n, l in enumerate(body) if l.startswith("Out: ")), len(body))
                text = body[1:end]
            elif body[0].startswith("Out: "):
                text = [body[0][len("Out: "):]] + body[1:]
            else:   # a failed step ("Code execution failed at line ..."), not the tool's output (fixed 2026-11-04)
                text = []
            if called[0] not in outs and text and not text[0].startswith("Refused"):
                outs[called[0]] = "\n".join(_unwrap(text)).strip()
        i = k
    return outs


def _memory(lines):
    """The memory text as printed (not wrapped) and its matches: (distance, document, metadata)."""
    text = "\n".join(lines)
    matches = []
    for m in re.finditer(r"  - distance ([\d.]+) \| (\S+) \| (.*)\n    Action taken: (.*?) -> verified STABLE"
                         r"(?: in (\d+) s)?\n    Diagnosis then: (.*)", text):
        matches.append((float(m[1]), m[3], {"time": m[2], "actions": m[4], "recovery_s": m[5] or "",
                                            "diagnosis": m[6]}))
    resolved = re.match(r"(\d+) similar verified past incident\(s\) of (\d+) stored", text)
    return text, matches, int(resolved[2]) if resolved else None


def _recent_v14(text):
    """v13's recent-actions lines in v14's wording (same content)."""
    if text.startswith("None"):
        return text
    out = []
    for item in re.split(r" (?=- \d\d:\d\d:\d\d \()", text):
        m = re.match(r"(- .*? min ago\)): (.*) -> verification (.*)$", item)
        out.append(f"{m[1]}: {m[2]}; verification: {m[3].rstrip('.')}." if m else item.rstrip(".") + ".")
    return "\n".join(out)


def _run_info(run_dir):
    name = os.path.basename(run_dir)
    scenario = "stuck" if "_stuck_" in name else "cpuhog" if "_cpuhog_" in name else \
        "unstable_test" if "unstable_test" in name else "baseline"
    start = None
    if os.path.exists(os.path.join(run_dir, "window.txt")):
        start = datetime.strptime(open(os.path.join(run_dir, "window.txt")).readline().strip(), "%Y-%m-%d %H:%M:%S")
    return scenario, start


def extract_cases():
    runs = sorted(glob.glob(os.path.join(LT, "eval_*llm_2026110[1-3]_*"))) + [os.path.join(LT, "archive",
                                                                                         "unstable_test_2026-11-01")]
    cases = []
    for run_dir in runs:
        log = open(os.path.join(run_dir, "controller.log"), errors="ignore").read().split("\n")
        scenario, start = _run_info(run_dir)
        wakes = [n for n, l in enumerate(log) if "Agent woke up" in l]
        run_cases = []
        for w, nxt in zip(wakes, wakes[1:] + [len(log)]):
            section = log[w:nxt]
            mem_lines = [section[1][len("🧠 [Memory] "):]]
            n = 2
            while n < len(section) and section[n].strip():
                mem_lines.append(section[n])
                n += 1
            memory_text, matches, resolved = _memory(mem_lines)
            top = next(n for n, l in enumerate(section) if l.startswith("╭"))
            bottom = next(n for n, l in enumerate(section) if l.startswith("╰"))
            box = _box(section[top + 1:bottom])
            flat = "\n".join(box)
            js = re.search(r"1-minute windows\): (\{.*?\})\nAssigned Signature", flat, re.S)[1]
            metrics = json.loads(" ".join(js.split("\n")).replace("\\]", "]").replace("\\[", "["))
            recent = re.search(r"verification\) ===\n(.*?)\n\n=== INCIDENT MEMORY", flat, re.S)[1]
            recent = " ".join(l.strip() for l in recent.split("\n"))
            applied = re.findall(r"\[SAFETY\] (scale applied: .*?from=(\d) to=(\d)|restart applied)", "\n".join(section))
            then = ["restart" if a[0].startswith("restart") else f"scale {a[1]}->{a[2]}" for a in applied]
            final = next((l[len("Final answer: "):] for l in section if l.startswith("Final answer: ")), "")
            run_cases.append({"run": os.path.relpath(run_dir, ROOT), "scenario": scenario,
                              "time": metrics.get("timestamp"), "metrics": metrics, "memory_v13": memory_text,
                              "memory_matches": matches, "memory_resolved": resolved, "recent_v13": recent,
                              "recent_v14": _recent_v14(recent), "outputs": _tool_outputs(section),
                              "then": then, "then_answer": final[:200]})
        for k, c in enumerate(run_cases):      # a tool the agent did not call then: the nearest wake-up's output
            c["borrowed"] = []
            for t in OBSERVE:
                if t in c["outputs"]:
                    continue
                donor = min((d for d in run_cases if t in d["outputs"]), default=None,
                            key=lambda d: abs(run_cases.index(d) - k))
                if donor:
                    c["outputs"][t] = donor["outputs"][t]
                    c["borrowed"].append(f"{t} from {donor['time']}")
            c["expected"], c["why"] = expected_action(c, start)
            c["id"] = f"{os.path.basename(c['run'])}@{c['time']}"
        cases += run_cases
    return cases


def expected_action(case, start):
    m = case["metrics"]
    if case["scenario"] == "unstable_test":
        if case["time"] in LEFT_OUT:
            return None, "left out: " + LEFT_OUT[case["time"]]
        return UNSTABLE_TEST[case["time"]], "UNSTABLE test, by hand"
    if case["scenario"] in ("stuck", "cpuhog") and start:
        wake = datetime.strptime(f"{start:%Y-%m-%d} {case['time']}", "%Y-%m-%d %H:%M:%S")
        if wake < start:
            wake = wake.replace(day=wake.day + 1)
        if (wake - start).total_seconds() >= FAULT_AT_S and not re.search(r"restart -> verification STABLE",
                                                                            case["recent_v13"]):
            return "restart", f"{case['scenario']}, after the fault"
    with mock.patch.object(agent_tools, "_health_bundle", agent_tools._health_bundle):
        need, _, _ = agent._minimum_pods(float(m["throughput"]), m.get("load_trend_rps_per_min"))
    current, ready = int(round(m["replicas"])), int(round(m.get("ready_replicas") or 0))
    if need != current and ready >= current:
        return f"scale {need}", f"capacity: minimum {need}, current {current}"
    return "none", f"minimum {need} = current {current}" + ("" if ready >= current else f", {ready} ready")


# ---------------------------------------------------------------- one run of one prompt on one case

def _recorded(real, output):
    """The real tool (name, description, inputs) answering with the recorded output; the guards still see the call."""
    t = copy.copy(real)

    def forward(*_args, **_kwargs):
        agent_tools._guard_observed(real.name)
        return output if output else f"(No output was recorded for {real.name}() in this incident.)"
    t.forward = forward
    return t


RECORDED_REFERENCE = "p95 <= 0.25 s, throttling <= 25%."
LAG_REFERENCE = (f"p95 <= 0.25 s, event-loop lag p99 ~{agent_tools.HEALTHY_LAG_P99} s "
                 f"(max {agent_tools.HEALTHY_LAG_P99_MAX}), throttling <= 25%.")


def with_lag_reference(outputs):
    """The recorded outputs with get_pod_breakdown's healthy reference as v14's tool gives it (A33, 12:28)."""
    out = dict(outputs)
    if out.get("get_pod_breakdown"):
        out["get_pod_breakdown"] = out["get_pod_breakdown"].replace(RECORDED_REFERENCE, LAG_REFERENCE)
    return out


def _ends(text, head=300, tail=900):
    """The start and the end of a long model output (where a missing code fence shows)."""
    return text if len(text) <= head + tail else text[:head] + " [...] " + text[-tail:]


def run_case(case, variant):
    outputs = with_lag_reference(case["outputs"]) if variant == LAG else case["outputs"]
    tools = [_recorded(getattr(agent_tools, t), outputs.get(t)) for t in OBSERVE] + \
            [agent_tools.scale_kubernetes_deployment, agent_tools.restart_kubernetes_deployment]
    metrics = {**case["metrics"], "window": "1m"}
    if variant in ("v14", LAG):
        sre = agent.make_sre_agent(agent.model, tools)
        memory = (agent_tools.format_memory(case["memory_matches"], case["memory_resolved"],
                                            agent_tools._similar_max())
                  if case["memory_matches"] else case["memory_v13"])
        task = agent.incident_message(metrics, memory, case["recent_v14"])
    else:
        sre = CodeAgent(tools=tools, model=agent.model, add_base_tools=False, max_steps=10,
                        step_callbacks=[agent_tools.guard_step_done],
                        final_answer_checks=[agent_tools.guard_final_answer_check,
                                             agent_tools.claim_final_answer_check])
        mj = json.dumps(case["metrics"])
        task = prompt_v13.AGENT_PROMPT.format(
            metrics_json=mj, signature=prompt_v13.generate_deterministic_signature(mj),
            capacity=prompt_v13.capacity_context(agent.CAPACITY), facts=prompt_v13._computed_facts(case["metrics"]),
            recent=case["recent_v13"], memory=case["memory_v13"], nfr_p95=agent.nfr_metrics.NFR_P95,
            nfr_errors_pct=100 * agent.nfr_metrics.NFR_ERRORS, max_pods=agent.nfr_metrics.MAX_PODS)
    sre.logger.level = -1     # quiet: the result line says what happened
    agent.model.reset_stats()
    agent_tools.reset_run_outcome()
    agent_tools._last_scale_action_at = agent_tools._last_restart_action_at = -1e9
    applied, answer, error = [], "", ""
    started = time.monotonic()
    with mock.patch.object(agent_tools, "get_kube_config"), \
            mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        apps.return_value.read_namespaced_deployment_scale.return_value.spec.replicas = int(round(metrics["replicas"]))
        apps.return_value.patch_namespaced_deployment.side_effect = lambda **kw: applied.append("restart")
        apps.return_value.patch_namespaced_deployment_scale.side_effect = \
            lambda **kw: applied.append(f"scale {kw['body']['spec']['replicas']}")
        agent_tools.guard_start(enforce=True)
        try:
            answer = str(sre.run(task))
        except Exception as e:
            error = f"{type(e).__name__}: {e}"[:300]
        agent_tools.guard_stop()
    steps = [s for s in sre.memory.steps if type(s).__name__ == "ActionStep"]
    errors = [str(getattr(s, "error", "") or "") for s in steps]
    return {"case": case["id"], "variant": variant, "expected": case["expected"], "applied": applied,
            "answer": answer[:300], "error": error, "steps": len(steps),
            "format_failures": sum(("Error in code parsing" in e or "variable `python`" in e) for e in errors),
            "failed_outputs": [_ends(str(s.model_output or "")) + " || " + e[:200] for e, s in zip(errors, steps)
                               if "Error in code parsing" in e or "variable `python`" in e],
            "refusals": sum("Refused" in e or "Refused" in str(getattr(s, "observations", "") or "")
                            for e, s in zip(errors, steps)),
            "llm_calls": agent.model.stats["calls"], "retries": agent.model.stats["retries"],
            "fallback_calls": agent.model.stats["fallback_calls"], "fenced": agent.model.stats["fenced"],
            "seconds": round(time.monotonic() - started, 1),
            "at": datetime.now().isoformat(timespec="seconds")}


def outcome(r):
    """The decision of one run: 'none', 'restart' or 'scale N' (the last action applied)."""
    return r["applied"][-1] if r["applied"] else "none"


# ---------------------------------------------------------------- driver and report

def load_results():
    if not os.path.exists(RESULTS):
        return []
    return [json.loads(l) for l in open(RESULTS) if l.strip()]


def main_run(reps, passes=3):
    """Each case reps times with each prompt. A run the provider broke (an exception: every retry and the fallback
    failed) stays in the results, is not counted (report()) and is tried again in a later pass, so both prompts get
    the same number of whole runs."""
    cases = [c for c in extract_cases() if c["expected"]]
    json.dump(cases, open(CASES, "w"), indent=1)
    done = Counter((r["case"], r["variant"]) for r in load_results() if not r["error"] and not r.get("superseded"))
    for _ in range(passes):
        for rep in range(1, reps + 1):
            for c in cases:
                for variant in ("v13", "v14") if rep % 2 else ("v14", "v13"):
                    if done[(c["id"], variant)] >= rep:
                        continue
                    r = run_case(c, variant)
                    r["rep"] = rep
                    with open(RESULTS, "a") as f:
                        f.write(json.dumps(r) + "\n")
                    done[(c["id"], variant)] += not r["error"]
                    ok = "right" if outcome(r) == c["expected"] else "WRONG"
                    print(f"[{datetime.now():%H:%M:%S}] rep {rep} {variant} {c['id']}: expected {c['expected']}, "
                          f"got {outcome(r)} ({ok}); {r['steps']} steps, {r['llm_calls']} calls, "
                          f"{r['format_failures']} format failures, {r['seconds']} s"
                          + (f"; fenced {r['fenced']}" if r["fenced"] else "")
                          + (f"; fallback {r['fallback_calls']}" if r["fallback_calls"] else "")
                          + (f"; error {r['error'][:80]}" if r["error"] else ""), flush=True)
        if all(done[(c["id"], v)] >= reps for c in cases for v in ("v13", "v14")):
            break
    lag_cases = [c for c in cases if not c["expected"].startswith("scale")]   # where the pod breakdown is read
    for _ in range(passes):
        for rep in range(1, reps + 1):
            for c in lag_cases:
                if done[(c["id"], LAG)] >= rep:
                    continue
                r = run_case(c, LAG)
                r["rep"] = rep
                with open(RESULTS, "a") as f:
                    f.write(json.dumps(r) + "\n")
                done[(c["id"], LAG)] += not r["error"]
                print(f"[{datetime.now():%H:%M:%S}] rep {rep} {LAG} {c['id']}: expected {c['expected']}, got "
                      f"{outcome(r)} ({'right' if outcome(r) == c['expected'] else 'WRONG'}); {r['steps']} steps, "
                      f"{r['format_failures']} format failures, {r['seconds']} s"
                      + (f"; error {r['error'][:80]}" if r["error"] else ""), flush=True)
        if all(done[(c["id"], LAG)] >= reps for c in lag_cases):
            break


def report():
    cases = {c["id"]: c for c in json.load(open(CASES))}
    superseded = [r for r in load_results() if r.get("superseded")]
    results = [r for r in load_results() if r["case"] in cases and not r.get("superseded")]
    primary = [r for r in results if not r["fallback_calls"] and not r["error"]]
    by = defaultdict(lambda: defaultdict(list))
    for r in primary:
        by[r["case"]][r["variant"]].append(r)
    print("# Prompt evaluation: v13's prompt against v14's (A33)\n")
    print(f"*`prompt_eval.py --report`, {datetime.now():%Y-%m-%d %H:%M}. {len(cases)} recorded wake-ups "
          f"(1-3/11, the current health model), {len(results)} runs with {agent.PRIMARY_MODEL}; {len(primary)} used "
          f"only the primary model and are counted ({len(results) - len(primary)} used the fallback or failed).*\n")
    if superseded:
        print(f"*{len(superseded)} earlier runs are superseded and not counted: "
              + "; ".join(f"{n} × {why}" for why, n in Counter(r["superseded"] for r in superseded).items()) + ".*\n")
    draft = any(r["variant"] == DRAFT for r in primary)
    if draft:
        print(f"*{DRAFT}: the first draft of v14's prompt (reasoning as comments inside the code block), stopped after "
              f"its runs below lost steps to unfenced code; v14 is the prompt as fixed (a \"Thoughts:\" line, then the "
              f"block) and was run again in full (A33). Its column is for reference; the criteria compare v14 with "
              f"v13.*\n")
    print("## Summary\n")
    variants = ("v13", "v14") + ((DRAFT,) if draft else ())
    print("| | " + " | ".join(f"{v} prompt" for v in variants) + " |")
    print("|---" * (len(variants) + 1) + "|")
    stats = {}
    for v in variants:
        rs = [r for r in primary if r["variant"] == v]
        right = sum(outcome(r) == r["expected"] for r in rs)
        stats[v] = {"n": len(rs), "right": right, "rate": right / len(rs) if rs else 0.0,
                    "format": sum(r["format_failures"] for r in rs), "steps": statistics.median(r["steps"] for r in rs)
                    if rs else 0, "calls": sum(r["llm_calls"] for r in rs), "seconds": statistics.median(
                        r["seconds"] for r in rs) if rs else 0, "refusals": sum(r["refusals"] for r in rs),
                    "fenced": sum(r["fenced"] for r in rs if "fenced" in r) if any("fenced" in r for r in rs) else None}
    rows = [("Right action", lambda s: f"{s['right']}/{s['n']} ({100 * s['rate']:.0f}%)"),
            ("Code-format failures (steps)", lambda s: str(s["format"])),
            ("Bare-code replies fenced by code (not failures)", lambda s: "n/a" if s["fenced"] is None else str(s["fenced"])),
            ("Median LLM steps per run", lambda s: f"{s['steps']:g}"),
            ("Guard refusals (steps)", lambda s: str(s["refusals"])),
            ("Median seconds per run", lambda s: f"{s['seconds']:g}"),
            ("LLM calls in all", lambda s: str(s["calls"]))]
    for name, f in rows:
        print(f"| {name} | " + " | ".join(f(stats[v]) for v in variants) + " |")
    wrong_restart = [cid for cid, vs in by.items() if cases[cid]["expected"] != "restart"
                     and any(outcome(r) == "restart" for r in vs["v14"])
                     and not any(outcome(r) == "restart" for r in vs["v13"])]
    crit = [("1. right-action rate at least v13's", stats["v14"]["rate"] >= stats["v13"]["rate"]),
            ("2. no code-format failure", stats["v14"]["format"] == 0),
            ("3. median steps not above v13's", stats["v14"]["steps"] <= stats["v13"]["steps"]),
            ("4. no wrong restart v13 never made", not wrong_restart)]
    print("\n## Criteria (declared before the first run)\n")
    for name, ok in crit:
        print(f"- {name}: **{'pass' if ok else 'FAIL'}**")
    if wrong_restart:
        print(f"  - wrong restarts by v14 only: {', '.join(wrong_restart)}")
    lag_runs = [r for r in primary if r["variant"] == LAG]
    if lag_runs:
        print(f"\n## The event-loop lag reference in get_pod_breakdown ({LAG}, A33)\n")
        print("v14 against v14 with the tool's new healthy reference, on the non-capacity cases (the recorded pod "
              "breakdown with the new reference line).\n")
        print(f"| Cases | v14 | {LAG} |\n|---|---|---|")
        lag_ids = {r["case"] for r in lag_runs}
        def right_of(v, kind):
            rs = [r for r in primary if r["variant"] == v and r["case"] in lag_ids and cases[r["case"]]["expected"] == kind]
            return sum(outcome(r) == kind for r in rs), len(rs)
        def wrong_restarts(v):
            rs = [r for r in primary if r["variant"] == v and r["case"] in lag_ids and cases[r["case"]]["expected"] == "none"]
            return sum(outcome(r) == "restart" for r in rs), len(rs)
        a14, a_lag = right_of("v14", "restart"), right_of(LAG, "restart")
        b14, b_lag = wrong_restarts("v14"), wrong_restarts(LAG)
        f_lag = sum(r["format_failures"] for r in lag_runs)
        print(f"| restart cases: right | {a14[0]}/{a14[1]} | {a_lag[0]}/{a_lag[1]} |")
        print(f"| no-action cases: wrong restarts | {b14[0]}/{b14[1]} | {b_lag[0]}/{b_lag[1]} |")
        print(f"| no-action cases: right | {right_of('v14', 'none')[0]}/{right_of('v14', 'none')[1]} | "
              f"{right_of(LAG, 'none')[0]}/{right_of(LAG, 'none')[1]} |")
        print(f"| code-format failures | {sum(r['format_failures'] for r in primary if r['variant'] == 'v14' and r['case'] in lag_ids)} | {f_lag} |")
        rate = lambda x: x[0] / x[1] if x[1] else 0.0
        print("\nCriteria (declared before the first run):\n")
        print(f"- (a) restart cases, right action not below v14's: **{'pass' if rate(a_lag) >= rate(a14) else 'FAIL'}**")
        print(f"- (b) no-action cases, wrong restarts not above v14's: **{'pass' if rate(b_lag) <= rate(b14) else 'FAIL'}**")
        print(f"- (c) no code-format failure: **{'pass' if f_lag == 0 else 'FAIL'}**")
        print("\n| Case | Expected | v14 | " + LAG + " |\n|---|---|---|---|")
        for cid in sorted(lag_ids):
            cell = lambda v: ", ".join(outcome(r) for r in sorted(by[cid][v], key=lambda r: r["rep"])) or "-"
            print(f"| {cid} | {cases[cid]['expected']} | {cell('v14')} | {cell(LAG)} |")
    print("\n## Every case\n")
    print("| Case | Expected (why) | At the time | v13 prompt | v14 prompt | Borrowed outputs |\n|---|---|---|---|---|---|")
    for cid, c in cases.items():
        cell = lambda v: ", ".join(outcome(r) + ("" if outcome(r) == c["expected"] else " ✗")
                                   for r in sorted(by[cid][v], key=lambda r: r["rep"])) or "-"
        print(f"| {cid} | {c['expected']} ({c['why']}) | {'; '.join(c['then']) or 'none'} | {cell('v13')} | "
              f"{cell('v14')} | {len(c['borrowed'])} |")
    left = [c for c in extract_cases() if not c["expected"]]
    if left:
        print("\nLeft out: " + "; ".join(f"{c['id']} ({c['why']})" for c in left))
    wrong = [r for r in primary if outcome(r) != r["expected"] and r["variant"] in ("v13", "v14")]
    if wrong:
        print("\n## The wrong runs\n")
        for r in wrong:
            print(f"- {r['variant']} {r['case']} (rep {r['rep']}): expected {r['expected']}, got {outcome(r)}; "
                  f"{r['steps']} steps. Answer: {r['answer'][:220]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--cases", action="store_true")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    if a.cases:
        for c in extract_cases():
            print(f"{c['id']:42} {c['scenario']:13} expected {str(c['expected']):9} then {';'.join(c['then']) or 'none':22}"
                  f" outputs {sorted(c['outputs'])} borrowed {len(c['borrowed'])} mem {len(c['memory_matches'])}"
                  f"/{c['memory_resolved']} | {c['why']}")
    elif a.report:
        report()
    else:
        main_run(a.reps)
