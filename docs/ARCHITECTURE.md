# Architecture

## Layers

1. **UI (React)** — dashboard jobs, accounts, API pool, settings, AI Agent panel.
2. **Electron main** — privileged desktop actions, credential vault, process/browser orchestration.
3. **Deterministic automation** — input scanning, Part pairing, Chrome profile launch, AI Studio UI control, generate state, download detection, rename/output.
4. **AI Agent** — interprets natural-language commands, diagnoses failures, and calls only allowlisted local tools.
5. **Gemini API Pool** — up to 100 locally encrypted key slots; used only when deterministic logic is insufficient.

## Pairing

Sorted Parts are assigned sequentially:

- Part 1 → VO01 + VO02
- Part 2 → VO03 + VO04
- ...
- Part 25 → VO49 + VO50
- Part 26 → VO01 + VO02 again

The executor is separate from assignment. By default only 3 Parts (6 browser windows) run simultaneously.

## Provider limits

Technical failover (browser crash, expired session, network/UI timeout) can choose another eligible profile. Provider-enforced quota/limit conditions are paused and surfaced to the user rather than automatically rotating identities to bypass a provider limit.
