# CloudTerm Local SSH Relay

A tiny, self-contained Go WebSocket-to-SSH bridge that lets the CloudTerm PWA connect to any TCP SSH server from your browser via `ws://localhost:8022`.

## Prerequisites

- [Go 1.22+](https://go.dev/dl/)

## Quick Start

Run directly without building:

```bash
cd relay
go run .
```

Or build a standalone binary:

```bash
cd relay
go build -o cloudterm-relay .
./cloudterm-relay
```

On Windows:

```powershell
cd relay
go build -o cloudterm-relay.exe .
.\cloudterm-relay.exe
```

## Options

| Flag | Default | Description |
| --- | --- | --- |
| `-addr` | `127.0.0.1:8022` | WebSocket listen address |

Example on a custom port:

```bash
./cloudterm-relay -addr 127.0.0.1:9022
```

Then update **Local Relay URL** in CloudTerm's SSH Settings accordion to `ws://localhost:9022`.
