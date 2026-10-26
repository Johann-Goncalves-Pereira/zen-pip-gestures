#!/usr/bin/env python3
"""Deny --no-verify on git commands and force-push to main/master."""

from __future__ import annotations

import json
import re
import sys


def deny(message: str) -> int:
    print(
        json.dumps(
            {
                "permission": "deny",
                "user_message": message,
                "agent_message": message,
            }
        )
    )
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({"permission": "allow"}))
        return 0

    command = payload.get("command") or ""
    if not re.search(r"(^|[;&|]\s*|&&\s*|^\s*)git(\s|$)", command):
        print(json.dumps({"permission": "allow"}))
        return 0

    if re.search(r"--no-verify\b", command):
        return deny(
            "Blocked --no-verify. Hooks must run (see .cursor/rules/000-always.mdc)."
        )

    if re.search(r"\bpush\b", command) and re.search(
        r"(--force\b|--force-with-lease\b|(?<![\w-])-f(?![\w-]))", command
    ):
        if re.search(r"\b(main|master)\b", command):
            return deny(
                "Blocked force-push to main/master without explicit user request."
            )

    print(json.dumps({"permission": "allow"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
