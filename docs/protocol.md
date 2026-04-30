# Protocol Sketch

Panel should eventually expose a small command/protocol surface that any terminal agent can call.

## Commands

```bash
panel show <file>
panel code <file> --line <number>
panel update <artifact-id> <file>
panel close <artifact-id>
panel list
```

## Artifact Types

```json
{
  "id": "artifact_123",
  "type": "code",
  "title": "src/backend/cli.ts",
  "source": "/path/to/file",
  "line": 137
}
```

## Future Events

```json
{
  "type": "artifact.edited",
  "artifactId": "artifact_123",
  "changes": []
}
```
