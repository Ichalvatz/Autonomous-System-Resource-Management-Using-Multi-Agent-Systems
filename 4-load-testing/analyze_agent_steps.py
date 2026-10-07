"""
Step-by-step view of every agent incident in the experiment runs (prompt v6 by default).

For each incident: the code block of each LLM step (which tools it called), whether the block
executed or failed to parse, and two behaviours worth reporting in the thesis:
  - investigated: an observation tool ran before the first action
  - pre-commitment: an action tool written in the SAME code block as an observation tool, i.e.
    the LLM decided before it had seen the evidence (whether or not the block ran)

Usage (repo root):  python 4-load-testing/analyze_agent_steps.py [label-substring, default "llm"] [prompt, default v6]
"""
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OBSERVE = ["get_pod_breakdown", "get_deployment_history", "get_kubernetes_logs"]
ACT = ["scale_kubernetes_deployment", "restart_kubernetes_deployment", "restart_kubernetes_pod",
       "rollback_kubernetes_deployment"]


def incidents(log_text, prompt):
    """Split a controller log into agent incidents of the given prompt version."""
    parts = re.split(r"🤖 \[AIOps Agent\] Agent woke up \(prompt (\w+)\)!", log_text)
    for i in range(1, len(parts), 2):
        if parts[i] == prompt:
            yield parts[i + 1].split("Agent cooldown")[0]


def steps(incident):
    for block in re.split(r"━+ Step \d+ ━+", incident)[1:]:
        lines, code, inside = block.splitlines(), [], False
        for line in lines:
            if "Executing parsed code" in line:
                inside = True
                continue
            if inside and line.strip().startswith("─"):
                break
            if inside:
                code.append(line)
        code = "\n".join(code)
        calls = [t for t in OBSERVE + ACT + ["final_answer"] for _ in re.finditer(rf"\b{t}\(", code)]
        failed = "Code parsing failed" in block or "Error in code parsing" in block
        yield calls, failed


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else "llm"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "v6"
    total = precommit = investigated = 0
    for d in sorted(glob.glob(os.path.join(HERE, f"eval_*{label}*"))):
        log = os.path.join(d, "controller.log")
        if not os.path.exists(log):
            continue
        for n, inc in enumerate(incidents(open(log, errors="replace").read(), prompt), 1):
            total += 1
            rows, first_action_seen, observed_before, pre = [], False, False, False
            for calls, failed in steps(inc):
                obs = [c for c in calls if c in OBSERVE]
                act = [c for c in calls if c in ACT]
                if obs and act:
                    pre = True
                if act and not failed and not first_action_seen:
                    first_action_seen = True
                if obs and not failed and not first_action_seen:
                    observed_before = True
                rows.append(("FAILED " if failed else "") + (", ".join(calls) or "(no tool call)"))
            precommit += pre
            investigated += observed_before
            print(f"{os.path.basename(d)} incident {n}: investigated first={observed_before} "
                  f"pre-commitment={pre}")
            for i, r in enumerate(rows, 1):
                print(f"    step {i}: {r}")
    print(f"\n{total} incidents (prompt {prompt}): investigated before acting {investigated}, "
          f"pre-commitment (action written with observation in one block) {precommit}")


if __name__ == "__main__":
    main()
