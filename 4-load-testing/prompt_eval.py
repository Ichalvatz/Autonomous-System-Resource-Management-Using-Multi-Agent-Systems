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
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

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


def last_reset(now=None):
    """When Gemini's daily quota last reset: midnight Pacific time (10:00 in Greece in winter), as a local datetime."""
    pacific = (now or datetime.now()).astimezone(ZoneInfo("America/Los_Angeles"))
    return pacific.replace(hour=0, minute=0, second=0, microsecond=0).astimezone().replace(tzinfo=None)


def wait_for_llm():
    """Wait until the primary model answers. The key is on Gemini's free tier: 500 requests a day per model (the
    fallback 20). When the day's quota is used up, sleep until 5 min after the next reset, else try every 5 min."""
    import litellm
    while True:
        try:
            litellm.completion(model=agent.PRIMARY_MODEL, max_tokens=5, timeout=30,
                               messages=[{"role": "user", "content": "Reply with the single word OK."}])
            return
        except Exception as e:
            if "PerDay" in str(e):
                wake = last_reset() + timedelta(days=1, minutes=5)
                print(f"[{datetime.now():%H:%M:%S}] the daily quota of {agent.PRIMARY_MODEL} is used up: waiting "
                      f"until {wake:%Y-%m-%d %H:%M}", flush=True)
                time.sleep(max(60.0, (wake - datetime.now()).total_seconds()))
            else:
                print(f"[{datetime.now():%H:%M:%S}] {agent.PRIMARY_MODEL} is not answering ({type(e).__name__}): "
                      f"trying again in 5 min", flush=True)
                time.sleep(300)


def focus(case):
    """The cases where the prompts differ: the 17 that call for an investigation (restart or no action). The capacity
    cases were settled by 2026-11-04 (v13 41/41, v14 36/36 right, v14 0 format failures), so the rest of the runs
    goes here (A33, 2026-11-05: Gemini's free tier allows 500 requests a day)."""
    return not case["expected"].startswith("scale")


def _run_logged(case, variant, rep, done):
    r = run_case(case, variant)
    r["rep"] = rep
    with open(RESULTS, "a") as f:
        f.write(json.dumps(r) + "\n")
    done[(case["id"], variant)] += not r["error"]
    print(f"[{datetime.now():%H:%M:%S}] rep {rep} {variant} {case['id']}: expected {case['expected']}, "
          f"got {outcome(r)} ({'right' if outcome(r) == case['expected'] else 'WRONG'}); {r['steps']} steps, "
          f"{r['llm_calls']} calls, {r['format_failures']} format failures, {r['seconds']} s"
          + (f"; fenced {r['fenced']}" if r["fenced"] else "")
          + (f"; fallback {r['fallback_calls']}" if r["fallback_calls"] else "")
          + (f"; error {r['error'][:80]}" if r["error"] else ""), flush=True)
    if r["error"]:   # the provider broke the run: it is run again later, once the model answers
        wait_for_llm()


def main_run(reps):
    """The runs still missing, resumable: v14 up to `reps` runs on each focus case (v13's runs stay as they are:
    1-3 per case), then the lag check (v14-lag) on the same cases. A run the provider broke (an exception: every retry
    and the fallback failed) stays in the results, is not counted (report()) and is run again."""
    cases = [c for c in extract_cases() if c["expected"]]
    json.dump(cases, open(CASES, "w"), indent=1)
    done = Counter((r["case"], r["variant"]) for r in load_results() if not r["error"] and not r.get("superseded"))
    wait_for_llm()
    for variant in ("v14", LAG):
        todo = [c for c in cases if focus(c)]
        while any(done[(c["id"], variant)] < reps for c in todo):
            for rep in range(1, reps + 1):
                for c in todo:
                    if done[(c["id"], variant)] < rep:
                        _run_logged(c, variant, rep, done)


def calls_since_reset():
    """LLM calls (with retries) of this evaluation since Gemini's daily quota last reset: an upper bound on its use."""
    since = last_reset()
    return sum(r["llm_calls"] for r in load_results() if datetime.fromisoformat(r["at"]) >= since)


def _counted():
    """The cases and the runs that count: not superseded, not broken by the provider, only the primary model."""
    cases = {c["id"]: c for c in json.load(open(CASES))}
    results = [r for r in load_results() if r["case"] in cases and not r.get("superseded")]
    primary = [r for r in results if not r["fallback_calls"] and not r["error"]]
    by = defaultdict(lambda: defaultdict(list))
    for r in primary:
        by[r["case"]][r["variant"]].append(r)
    return cases, results, primary, by


def _per_case(cases, by, v, ids):
    """Right-action rate (mean over cases) and steps (median of the per-case medians): each case weighs the same,
    whatever its number of runs (A33, 2026-11-05: v13 has 1-3 runs per case, v14 3 on the focus cases)."""
    ids = [cid for cid in ids if by[cid][v]]
    rate = statistics.mean(sum(outcome(r) == cases[cid]["expected"] for r in by[cid][v]) / len(by[cid][v])
                           for cid in ids) if ids else 0.0
    steps = statistics.median(statistics.median(r["steps"] for r in by[cid][v]) for cid in ids) if ids else 0
    return rate, steps


def lag_check(cases, by, primary):
    """The lag reference check (A33, 12:28 on 4/11): v14 against v14-lag on the cases both ran; (c) as redeclared on
    5/11 before any v14-lag run: not more format failures than v14 on the same cases."""
    ids = [cid for cid in cases if by[cid][LAG] and by[cid]["v14"]]
    def rate(v, kind, act):
        rs = [r for cid in ids if cases[cid]["expected"] == kind for r in by[cid][v]]
        return sum(outcome(r) == act for r in rs), len(rs)
    out = {"ids": ids, "complete": all(len(by[cid][LAG]) >= 3 for cid in cases if focus(cases[cid])),
           "restart": {v: rate(v, "restart", "restart") for v in ("v14", LAG)},
           "wrong_restart": {v: rate(v, "none", "restart") for v in ("v14", LAG)},
           "none_right": {v: rate(v, "none", "none") for v in ("v14", LAG)},
           "format": {v: sum(r["format_failures"] for cid in ids for r in by[cid][v]) for v in ("v14", LAG)}}
    frac = lambda x: x[0] / x[1] if x[1] else 0.0
    out["a"] = frac(out["restart"][LAG]) >= frac(out["restart"]["v14"])
    out["b"] = frac(out["wrong_restart"][LAG]) <= frac(out["wrong_restart"]["v14"])
    out["c"] = out["format"][LAG] <= out["format"]["v14"]
    return out


def gate():
    """0 if the lag check is complete and passed; else 1 (v14_finish.sh stops: the reference is then removed, A33)."""
    cases, _, primary, by = _counted()
    lc = lag_check(cases, by, primary)
    ok = lc["complete"] and lc["a"] and lc["b"] and lc["c"]
    print(f"lag check: {'complete' if lc['complete'] else 'INCOMPLETE'}; (a) {'pass' if lc['a'] else 'FAIL'}, "
          f"(b) {'pass' if lc['b'] else 'FAIL'}, (c) {'pass' if lc['c'] else 'FAIL'}")
    return 0 if ok else 1


def report():
    cases, results, primary, by = _counted()
    superseded = [r for r in load_results() if r.get("superseded")]
    print("# Prompt evaluation: v13's prompt against v14's (A33)\n")
    print(f"*`prompt_eval.py --report`, {datetime.now():%Y-%m-%d %H:%M}. {len(cases)} recorded wake-ups "
          f"(1-3/11, the current health model), {len(results)} runs with {agent.PRIMARY_MODEL}; {len(primary)} used "
          f"only the primary model and are counted ({len(results) - len(primary)} used the fallback or failed).*\n")
    if superseded:
        print(f"*{len(superseded)} earlier runs are superseded and not counted: "
              + "; ".join(f"{n} × {why}" for why, n in Counter(r["superseded"] for r in superseded).items()) + ".*\n")
    print("*Runs per case differ (A33, 2026-11-05): Gemini's free tier allows 500 requests a day, so after 4/11 only "
          "the 17 cases that call for an investigation got more runs (v14 up to 3); the capacity cases were settled "
          "(v13 41/41, v14 36/36 right) and v13 keeps its 1-3 runs per case. The criteria therefore weigh each case "
          "the same (rate = mean over cases; steps = median of the per-case medians).*\n")
    draft = any(r["variant"] == DRAFT for r in primary)
    if draft:
        print(f"*{DRAFT}: the first draft of v14's prompt (reasoning as comments inside the code block), stopped after "
              f"its runs lost steps to unfenced code; v14 is the prompt as fixed (a \"Thoughts:\" line, then the "
              f"block). Its column is for reference.*\n")
    print("## Summary (pooled runs)\n")
    variants = ("v13", "v14") + ((DRAFT,) if draft else ())
    print("| | " + " | ".join(f"{v} prompt" for v in variants) + " |")
    print("|---" * (len(variants) + 1) + "|")
    stats = {}
    for v in variants:
        rs = [r for r in primary if r["variant"] == v]
        stats[v] = {"n": len(rs), "format": sum(r["format_failures"] for r in rs),
                    "calls": sum(r["llm_calls"] for r in rs), "refusals": sum(r["refusals"] for r in rs),
                    "seconds": statistics.median(r["seconds"] for r in rs) if rs else 0,
                    "fenced": sum(r["fenced"] for r in rs if "fenced" in r) if any("fenced" in r for r in rs) else None}
        for kind in ("scale", "restart", "none"):
            ks = [r for r in rs if r["expected"].startswith(kind)]
            stats[v][kind] = f"{sum(outcome(r) == r['expected'] for r in ks)}/{len(ks)}"
    rows = [("Right action, capacity cases (scale)", lambda s: s["scale"]),
            ("Right action, restart cases", lambda s: s["restart"]),
            ("Right action, no-action cases", lambda s: s["none"]),
            ("Code-format failures (steps)", lambda s: str(s["format"])),
            ("Bare-code replies fenced by code (not failures)", lambda s: "n/a" if s["fenced"] is None else str(s["fenced"])),
            ("Guard refusals (steps)", lambda s: str(s["refusals"])),
            ("Median seconds per run", lambda s: f"{s['seconds']:g}"),
            ("Runs / LLM calls", lambda s: f"{s['n']} / {s['calls']}")]
    for name, f in rows:
        print(f"| {name} | " + " | ".join(f(stats[v]) for v in variants) + " |")
    common = [cid for cid in cases if by[cid]["v13"] and by[cid]["v14"]]
    (r13, s13), (r14, s14) = _per_case(cases, by, "v13", common), _per_case(cases, by, "v14", common)
    wrong_restart = [cid for cid, vs in by.items() if cases[cid]["expected"] != "restart"
                     and any(outcome(r) == "restart" for r in vs["v14"])
                     and not any(outcome(r) == "restart" for r in vs["v13"])]
    print(f"\nPer case ({len(common)} cases with runs of both): right-action rate v13 {100 * r13:.1f}%, "
          f"v14 {100 * r14:.1f}%; steps v13 {s13:g}, v14 {s14:g}.")
    crit = [("1. right-action rate at least v13's (per case)", r14 >= r13),
            ("2. no code-format failure", stats["v14"]["format"] == 0),
            ("3. median steps not above v13's (per case)", s14 <= s13),
            ("4. no wrong restart v13 never made", not wrong_restart)]
    print("\n## Criteria (declared before the first run)\n")
    for name, ok in crit:
        print(f"- {name}: **{'pass' if ok else 'FAIL'}**")
    if wrong_restart:
        print(f"  - wrong restarts by v14 only: {', '.join(wrong_restart)}")
    lc = lag_check(cases, by, primary)
    if lc["ids"]:
        print(f"\n## The event-loop lag reference in get_pod_breakdown ({LAG}, A33)\n")
        print("v14 against v14 with the tool's healthy lag reference (the recorded pod breakdown with the new reference "
              f"line), on the {len(lc['ids'])} investigation cases both ran"
              + ("" if lc["complete"] else " (**incomplete**)") + ".\n")
        cell = lambda x: f"{x[0]}/{x[1]}"
        print(f"| | v14 | {LAG} |\n|---|---|---|")
        print(f"| restart cases: restarted | {cell(lc['restart']['v14'])} | {cell(lc['restart'][LAG])} |")
        print(f"| no-action cases: wrong restarts | {cell(lc['wrong_restart']['v14'])} | {cell(lc['wrong_restart'][LAG])} |")
        print(f"| no-action cases: right | {cell(lc['none_right']['v14'])} | {cell(lc['none_right'][LAG])} |")
        print(f"| code-format failures | {lc['format']['v14']} | {lc['format'][LAG]} |")
        print("\nCriteria (declared before the first run; (c) redeclared on 5/11, before any run):\n")
        print(f"- (a) restart cases, right action not below v14's: **{'pass' if lc['a'] else 'FAIL'}**")
        print(f"- (b) no-action cases, wrong restarts not above v14's: **{'pass' if lc['b'] else 'FAIL'}**")
        print(f"- (c) not more code-format failures than v14: **{'pass' if lc['c'] else 'FAIL'}**")
        print("\n| Case | Expected | v14 | " + LAG + " |\n|---|---|---|---|")
        for cid in lc["ids"]:
            runs = lambda v: ", ".join(outcome(r) for r in sorted(by[cid][v], key=lambda r: r["rep"])) or "-"
            print(f"| {cid} | {cases[cid]['expected']} | {runs('v14')} | {runs(LAG)} |")
    print("\n## Every case\n")
    print("| Case | Expected (why) | At the time | v13 prompt | v14 prompt | Borrowed outputs |\n|---|---|---|---|---|---|")
    for cid, c in cases.items():
        cellv = lambda v: ", ".join(outcome(r) + ("" if outcome(r) == c["expected"] else " ✗")
                                    for r in sorted(by[cid][v], key=lambda r: r["rep"])) or "-"
        print(f"| {cid} | {c['expected']} ({c['why']}) | {'; '.join(c['then']) or 'none'} | {cellv('v13')} | "
              f"{cellv('v14')} | {len(c['borrowed'])} |")
    left = [c for c in extract_cases() if not c["expected"]]
    if left:
        print("\nLeft out: " + "; ".join(f"{c['id']} ({c['why']})" for c in left))
    failed = [r for r in primary if r.get("failed_outputs") and r["variant"] in ("v14", LAG)]
    if failed:
        print("\n## The replies that failed the code format (v14)\n")
        for r in failed:
            for text in r["failed_outputs"]:
                print(f"- {r['variant']} {r['case']} (rep {r['rep']}): `{text[:600].replace(chr(10), ' / ')}`")
    wrong = [r for r in primary if outcome(r) != r["expected"] and r["variant"] in ("v13", "v14", LAG)]
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
    ap.add_argument("--gate", action="store_true", help="exit 0 only if the lag check passed (A33)")
    ap.add_argument("--calls-since-reset", action="store_true")
    a = ap.parse_args()
    if a.cases:
        for c in extract_cases():
            print(f"{c['id']:42} {c['scenario']:13} expected {str(c['expected']):9} then {';'.join(c['then']) or 'none':22}"
                  f" outputs {sorted(c['outputs'])} borrowed {len(c['borrowed'])} mem {len(c['memory_matches'])}"
                  f"/{c['memory_resolved']} | {c['why']}")
    elif a.report:
        report()
    elif a.gate:
        sys.exit(gate())
    elif a.calls_since_reset:
        print(calls_since_reset())
    else:
        main_run(a.reps)
