"""Minimal S-expression reader/writer for KiCad files.

Used only by the rev0 generator scripts. Atoms are kept as Python str;
quoted strings are wrapped in QStr so they round-trip with quotes.
"""
from __future__ import annotations

import re


class QStr(str):
    """A string atom that was (or must be) quoted."""


_TOKEN = re.compile(r'\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))', re.S)


def parse(text: str):
    stack: list[list] = [[]]
    pos = 0
    n = len(text)
    while pos < n:
        m = _TOKEN.match(text, pos)
        if not m:
            if text[pos:].strip() == "":
                break
            raise ValueError(f"parse error at {pos}: {text[pos:pos+40]!r}")
        pos = m.end()
        if m.group(1):
            stack.append([])
        elif m.group(2):
            done = stack.pop()
            stack[-1].append(done)
        elif m.group(3) is not None:
            s = re.sub(r'\\(.)', lambda mm: {"n": "\n", '"': '"', "\\": "\\"}.get(mm.group(1), "\\" + mm.group(1)), m.group(3))
            stack[-1].append(QStr(s))
        elif m.group(4) is not None:
            stack[-1].append(m.group(4))
    if len(stack) != 1:
        raise ValueError("unbalanced parentheses")
    return stack[0][0] if len(stack[0]) == 1 else stack[0]


def _atom(a) -> str:
    if isinstance(a, QStr):
        return '"' + a.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
    if isinstance(a, bool):
        return "yes" if a else "no"
    if isinstance(a, float):
        s = f"{a:.6f}".rstrip("0").rstrip(".")
        return "0" if s in ("-0", "") else s
    return str(a)


def dump(node, indent: int = 0) -> str:
    if not isinstance(node, list):
        return _atom(node)
    # keep short leaf lists on one line
    if all(not isinstance(c, list) for c in node):
        return "(" + " ".join(_atom(c) for c in node) + ")"
    pad = "  " * (indent + 1)
    head = []
    rest = []
    for c in node:
        if not rest and not isinstance(c, list):
            head.append(_atom(c))
        else:
            rest.append(c)
    out = "(" + " ".join(head)
    for c in rest:
        out += "\n" + pad + dump(c, indent + 1)
    out += "\n" + "  " * indent + ")"
    return out


def find(node, key):
    """First child list whose head is key."""
    for c in node:
        if isinstance(c, list) and c and c[0] == key:
            return c
    return None


def findall(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]
