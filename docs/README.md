# Docs

Architecture and product wiki for Zen PiP gestures. Package READMEs stay short
and point here.

**Status legend:** pages mark work as **shipped**, **in progress**, or
**planned**. A page claims only what the code delivers. Decisions that will not
ship live in [Unshipped](product/unshipped.md).

---

## System topology

```mermaid
flowchart TB
  Bootstrap[install.sh curl bootstrap] --> Binary[zen-pip-install darwin binary]
  Binary --> TUI[cmd/install Charm TUI]
  TUI --> Patch[Patch ~/Applications/Zen.app]
  TUI --> Profile[Profile chrome JS/CSS]
  TUI --> Agent[LaunchAgent auto-repatch]
  Profile --> PiP[PiP player.xhtml scripts]
```

---

## Index

| Area | Pages |
| ---- | ----- |
| **Architecture** | [Overview](architecture/overview.md) |
| **Product** | [Auto-PiP](product/auto-pip.md) · [Unshipped](product/unshipped.md) |

---

## Spec catalog

- [`specs/catalog.md`](specs/catalog.md) — business rules and use cases traced
  to tests (`asserted` or `fail-closed`)

---

## Related READMEs

- [`../README.md`](../README.md)
