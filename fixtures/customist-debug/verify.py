"""Verify capture integrity and observed comparisons, not machine safety."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DAY = ROOT / "2026-11-13"
manifest = json.loads((DAY / "manifest.json").read_text())
cases = {c["id"]: c for c in manifest["captures"]}
assert len(cases) == 19

for artifact in manifest["files"]:
    data = (DAY / artifact["file"]).read_bytes()
    assert len(data) == artifact["bytes"], artifact["file"]
    assert hashlib.sha256(data).hexdigest() == artifact["sha256"], artifact["file"]


def instructions(path):
    lines = path.read_bytes().splitlines(keepends=True)
    assert lines[2].startswith(b"// ") and lines[2].rstrip().endswith(b".kc")
    return b"".join(lines[:2] + lines[3:])


def program(name):
    return instructions(DAY / cases[name]["file"])


def normalize(commands):
    result = copy.deepcopy(commands)
    for command in result:
        command.pop("uuid", None)
        command["parameters"].pop("canvasId", None)
    return result


reports = {}
for name, case in cases.items():
    stack = json.loads((DAY / case["sourceStack"]).read_text())
    source = [c for c in stack["commands"]
              if c["parameters"].get("canvasId") == case["canvasId"]]
    authored = json.loads((DAY / case["input"]).read_text())["commands"]
    if name == "reversible-increase-refusal":
        authored[-1]["parameters"]["style"] = 2  # observed UI change
    assert normalize(source) == normalize(authored), name
    report = json.loads((DAY / case["decoded"]).read_text())
    assert report["kcodeSha256"] == case["sha256"], name
    assert report["passCount"] == len(report["passes"]) == case["machinePasses"], name
    reports[name] = report["passes"]

assert program("reversible-increase-refusal") == program("reversible-shaped-open-control")
assert program("feeder-retract-off") == program("feeder-retract-on")
for style in ("simple", "fashioned"):
    assert program(f"right-phase0-{style}") == instructions(
        ROOT / "2026-11-12" / f"increase-right-{style}.kc")

for side in ("left", "right"):
    for phase in (0, 1):
        control = f"{side}-phase{phase}-control"
        expected = [22] * (8 + phase) + [23] * 8 + [24] * (8 - phase)
        passes = reports[control]
        assert [p["actions"].get("knit front", 0) for p in passes] == expected
        assert all(not p["actions"].get("knit rear") for p in passes)
        for style in ("simple", "fashioned"):
            name = f"{side}-phase{phase}-{style}"
            assert program(name) != program(control)
            events = cases[name]["yarnFedTransferModePasses"]
            assert len(events) == 2
            assert all(e["mode"] == ("Tr-Rl" if phase == 0 else "Tr-Rr")
                       and e["direction"] == ("<<" if phase == 0 else ">>")
                       and e["carrier"] == 3 for e in events)

for shape in ("rectangle", "shaped"):
    suffix = "-control" if shape == "shaped" else ""
    op = f"reversible-{shape}-open{suffix}"
    closed = f"reversible-{shape}-closed{suffix}"
    assert program(op) != program(closed)
    assert len(reports[op]) == len(reports[closed]) == 100
    body = [p for p in reports[op][24:96] if p["carrier"] in ("3", "4")]
    assert len(body) == 48
    for i, p in enumerate(body):
        width = (22 + i // 16) if shape == "shaped" else 24
        a = p["actions"]
        assert a.get("knit front", 0) + a.get("knit rear", 0) == width
        assert a.get("knit rear" if p["carrier"] == "3" else "knit front") == 4

print(f"Verified {len(manifest['files'])} artifact hashes, 19 source/decoder records, "
      "12-case increase matrix, reversible fallback, borders and feeder equality.")
print("No controller acceptance, physical knitting, or topology qualification asserted.")
