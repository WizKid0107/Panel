# Security

Panel runs local artifacts that may be produced by AI agents. Treat generated HTML and scripts as untrusted.

Initial safety rules:

- bind servers to `127.0.0.1`
- serve only explicit files or safe example directories
- do not expose arbitrary filesystem reads over HTTP
- require approval before writes
- keep network-capable runners separate from local renderers
- log artifact opens and writes

Future desktop shells should use stricter sandboxing where possible.
