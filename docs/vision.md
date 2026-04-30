# Vision

Terminal AI agents are powerful, but they mostly speak through text.

Panel gives them a visual output layer. When an agent needs to show a file, preview a UI, explain a diff, display an image, or let the user edit an artifact, it opens Panel instead of forcing everything into the terminal.

## Principles

- The terminal stays the command center.
- Panel is model-agnostic.
- Artifacts are local-first.
- Every write action should be explicit and auditable.
- Runners are separate from the panel shell.
- The protocol should be simple enough for any CLI agent to implement.

## Examples

```text
show me line 137
-> code artifact with line 137 highlighted

show me the full file
-> full code viewer

preview this UI
-> HTML/React runner artifact

compare these screenshots
-> image comparison artifact

open the test results
-> searchable test/log artifact
```
