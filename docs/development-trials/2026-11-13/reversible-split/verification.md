# Gate 3 comparison — software evidence

This record concerns the outward-first experiment at `c1f46e9` and simulator
roller fix `900eae8`. The exact artifacts are pinned in [README.md](README.md).
Implementation review and physical qualification remain separate gates.

| Check | Result |
| --- | --- |
| Split roller and reversible comparison suites | 19/19 tests passed |
| Old simulator negative control | Six roller cases fail; four knit-first controls pass |
| Deleted split, wrong-bed outer join, missing roller increment | Rejected on both sides |
| Inward-first entry | Refused |
| Explicit TypeScript check of both experiment scripts and new test files | Passed |
| New stored Knitout, KCode and verification reports | Both variants re-emit byte for byte; [six file hashes](replay-evidence.json) |
| Canonical strict parse, validator, safety, loop audit, serialized schedule | Pass for both exact files |
| Candidate ancestry, P/Q colours, cross-bed returns, occupancy, working counts | Pass for both exact files |
| Body carrier movement / stack / take-down | No C1/C6 moves, maximum stack one, exactly two positive roller working passes per cycle |
| Construction matrix | All 47 build/audit and remain byte-identical; [hash comparison](regression-evidence.json) |
| Single-bed Gate 2 | Rebuilt byte-identical: `fb2cb6adcfb4320992dcec26e8b80e0cbdcb905b4d25548780f20b04b5c24de5` |
| Registered 522-pass baseline | Knitout and KCode re-emit byte for byte; no changed baseline record |
| Registry check | 5/5 valid evidence entries; zero Knit-proven entries |
| Dedicated KCode suite / Studio integration suite | 378/378 and 190/190 passed |
| Command mutation proof | 3,268/3,268 tested mutants caught; zero survivors, timeouts or uncovered mutants; 64 existing reviewed exclusions |
| Full KCode software proof | `software-proven`; all 12 gates pass, zero audit failures, 13 reference files checked |
| Repository `pnpm verify` | Passed: 965 workspace tests, typechecks, conformance, build and current receipt |
| Chromium E2E | 53/54 passed initially; the failed large-import timing case passed its isolated recheck at 683.4 ms against the unchanged 2,000 ms limit; [both results](browser-evidence.json) |

The mixed-paisley baseline's global compiler fingerprint is stale after this
engine change, even though its experiment bytes still match. Its known missing
run details and experiment-only promotion guard remain; no physical status has
been upgraded. Older registry entries retain their pre-existing replay and
evidence limitations.

The [proof receipt](../../../../packages/machine-lib/out/kcode-proof/proof-manifest.json)
binds source and harness SHA-256
`a8e886ccde6e2724d6e58a047efa7fb5987d10dd47390d41a5099faf621788b2`.
The mutation receipt is byte-identical to its prior version; the new proof
receipt additionally binds both new suites and the experiment scripts.

The first sandboxed proof attempt failed because child processes and IPC were
denied (`EPERM`). The sandboxed browser attempt could not open its localhost
server. Those runs are not passes; the commands were rerun with the required
local permissions, without disabling checks. The first unrestricted browser
run overlapped proof work and failed the large-import responsiveness bound
(2,141 ms). After `pnpm verify` finished, that exact test passed alone with
one worker (683.4 ms); two imports and one terminated worker were also checked.
No source or test limit changed between runs. All 54 cases have passed across
the full run and the isolated recheck, but the original four-worker run did
not pass in one attempt. These observations do not establish the cause of
the initial pause or repeatability under that load.

The simulator regression compares pass direction, carrier, speed and roller.
It does not establish general split-operation-type prediction parity. The
new comparison's actual split type, direction, rack, needles, parentage and
roller are independently checked from the serialized KCode trace. No backend
source, machine profile or safety envelope was changed.

Each exact file retains one C6 frame carry advisory (23 needles, pass 80→86);
see the package readme and observation form. No software result establishes
terminal split operation, physical yarn clearance, edge quality or the 450/0
take-down plan on the Kniterate. No controller load or knit took place.
