# V14 Migration Plan

V14 remains the behavioral reference for: input discovery, Part number parsing, TXT/MD/DOCX reading, persistent Chrome profile lookup, AI Studio launch, UI Automation, and 2-VO-per-Part behavior.

Migration sequence:

1. Port Part discovery and text extraction.
2. Expand profile registry from 30 to 50.
3. Replace fixed five batch buttons with a job queue.
4. Preserve 3-Part / 6-window default concurrency.
5. Add voice selection + generate detection.
6. Add download queue with hard 04:30–05:05 window.
7. Add output detection, deterministic naming, retry/resume, and logs.
8. Expose allowlisted actions to the AI Agent.

The old scripts are reference material; the new codebase will not depend on hard-coded screen coordinates.
