# Panel

Panel is an open AGUI runtime for terminal AI agents.

It gives CLI agents a local visual workspace for artifacts: code viewers, Markdown previews, HTML demos, UI mockups, images, diffs, logs, and future editable surfaces.

The terminal stays the command center. Panel is the visual sidecar.

## Status

This repo is early. The first version is intentionally small:

- show local HTML, Markdown, images, JSON, and text files
- open a full-file code viewer with line numbers
- highlight a requested line
- serve artifacts through a local `127.0.0.1` server
- launch the system browser for now

Desktop window shells, React runners, editable artifacts, and agent protocol integrations come next.

## Quick Start

```bash
npm run show
```

Show a file:

```bash
node src/cli.js show examples/markdown/vision.md
```

Show a code file with a highlighted line:

```bash
node src/cli.js code src/cli.js --line 120
```

Pick a port:

```bash
node src/cli.js show examples/html/hello.html --port 4317
```

Run without opening a browser:

```bash
node src/cli.js code examples/code/sample.ts --line 2 --no-open
```

## Shape

```text
CLI agent
  -> Panel protocol
      -> local artifact server
      -> visual panel/browser window
      -> runners for HTML, Markdown, code, images, apps
```

Panel is not an AI model and not a chat app. It is the visual runtime that an agent can call when text is the wrong output format.

## Roadmap

- AGUI protocol schema
- live artifact updates
- Markdown editor
- visual diff viewer
- log viewer
- React/Vite runner
- screenshot/image comparison
- secure sandbox policy
- macOS desktop shell
