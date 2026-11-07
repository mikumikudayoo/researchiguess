"""Compare KiCad's exported netlist (kicadsexpr) with design.py intent.

Usage: python check_netlist.py <netlist.net>
Exit 1 on any mismatch. KiCad prefixes local nets with the sheet path
(e.g. "/Pump switch/PUMP_SRC"); the checker strips that prefix.
"""
import sys
from collections import defaultdict

from design import SHEETS
from sexp import find, findall, parse


def strip(name: str) -> str:
    return name.rsplit("/", 1)[-1]


def main(path):
    tree = parse(open(path, encoding="utf-8").read())
    actual = {}
    for net in findall(find(tree, "nets"), "net"):
        name = strip(str(find(net, "name")[1]))
        for node in findall(net, "node"):
            ref = str(find(node, "ref")[1])
            pin = str(find(node, "pin")[1])
            actual[(ref, pin)] = name
    expected = {}
    for s in SHEETS:
        for p in s.parts:
            for pin, net in p.nets.items():
                expected[(p.ref, pin)] = net
    errors = []
    for key, net in sorted(expected.items()):
        got = actual.get(key)
        if net is None:
            if got is not None and not got.startswith("unconnected-"):
                errors.append(f"{key}: expected no-connect, got {got}")
        elif got != net:
            errors.append(f"{key}: expected {net}, got {got}")
    for key in actual:
        if key not in expected:
            errors.append(f"{key}: in netlist but not in design")
    # net summary
    members = defaultdict(list)
    for (ref, pin), net in expected.items():
        if net:
            members[net].append(f"{ref}.{pin}")
    singles = [n for n, m in members.items() if len(m) < 2]
    print(f"pins checked: {len(expected)}; nets: {len(members)}")
    if singles:
        print("WARNING single-pin nets:", singles)
    if errors:
        print("MISMATCHES:")
        print("\n".join(errors))
        return 1
    print("netlist matches design intent")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
