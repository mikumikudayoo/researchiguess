"""Write .kicad_pro, sym-lib-table and fp-lib-table for the rev0 project."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "kicad"
PROJECT = "taph_carrier_rev0"


def netclass(name, clearance, width, via_d=0.8, via_drill=0.4, prio=0, color="rgba(0, 0, 0, 0.000)"):
    return {"bus_width": 12, "clearance": clearance, "diff_pair_gap": 0.25, "diff_pair_via_gap": 0.25,
            "diff_pair_width": 0.2, "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1,
            "name": name, "pcb_color": color, "priority": prio, "schematic_color": "rgba(0, 0, 0, 0.000)",
            "track_width": width, "tuning_profile": "", "via_diameter": via_d, "via_drill": via_drill, "wire_width": 6}


pro = {
    "board": {
        "design_settings": {
            "defaults": {},
            "diff_pair_dimensions": [],
            "drc_exclusions": [],
            "rules": {
                # conservative values, well inside typical 2-layer prototype fab capability (to be matched to chosen fab)
                "min_clearance": 0.2, "min_track_width": 0.2, "min_via_diameter": 0.6,
                "min_through_hole_diameter": 0.3, "min_via_annular_width": 0.15,
                "min_copper_edge_clearance": 0.5, "min_hole_to_hole": 0.25, "min_hole_clearance": 0.25,
                "min_silk_clearance": 0.0, "min_text_height": 0.8, "min_text_thickness": 0.15,
                "allow_blind_buried_vias": False, "allow_microvias": False,
            },
            "track_widths": [0.25, 0.4, 0.6, 1.0, 1.5, 2.0],
            "via_dimensions": [{"diameter": 0.8, "drill": 0.4}, {"diameter": 1.0, "drill": 0.5}],
        }
    },
    "boards": [],
    "libraries": {"pinned_footprint_libs": [], "pinned_symbol_libs": []},
    "meta": {"filename": f"{PROJECT}.kicad_pro", "version": 3},
    "net_settings": {
        "classes": [
            netclass("Default", 0.2, 0.25, prio=2147483647),
            netclass("Power_Logic", 0.25, 0.6, prio=2),
            # Placeholder widths only: the real current of pump and servo paths is UNVERIFIED (routing blocked).
            netclass("Pump_HighCurrent_BLOCKED", 0.3, 2.0, 1.0, 0.5, prio=0, color="rgba(255, 0, 0, 0.400)"),
            netclass("Servo_Power_BLOCKED", 0.3, 1.5, 1.0, 0.5, prio=1, color="rgba(255, 128, 0, 0.400)"),
            netclass("Analog_Sense", 0.25, 0.25, prio=3),
        ],
        "meta": {"version": 5},
        "net_colors": None,
        "netclass_assignments": None,
        "netclass_patterns": [
            {"netclass": "Power_Logic", "pattern": "*VIN_*"},
            {"netclass": "Power_Logic", "pattern": "*+5V*"},
            {"netclass": "Power_Logic", "pattern": "*+3V3"},
            {"netclass": "Power_Logic", "pattern": "GND"},
            {"netclass": "Pump_HighCurrent_BLOCKED", "pattern": "*PUMP_VIN_RAW"},
            {"netclass": "Pump_HighCurrent_BLOCKED", "pattern": "*+12V_PUMP"},
            {"netclass": "Pump_HighCurrent_BLOCKED", "pattern": "*PUMP_SW"},
            {"netclass": "Pump_HighCurrent_BLOCKED", "pattern": "*PUMP_SRC"},
            {"netclass": "Pump_HighCurrent_BLOCKED", "pattern": "*PGND"},
            {"netclass": "Servo_Power_BLOCKED", "pattern": "*SERVO_VIN_RAW"},
            {"netclass": "Servo_Power_BLOCKED", "pattern": "*SERVO_V+"},
            {"netclass": "Servo_Power_BLOCKED", "pattern": "*SERVO_GND"},
            {"netclass": "Analog_Sense", "pattern": "*_ADC"},
            {"netclass": "Analog_Sense", "pattern": "*_DIV"},
        ],
    },
    "pcbnew": {"page_layout_descr_file": ""},
    "schematic": {"drawing": {"default_text_size": 50.0}, "legacy_lib_dir": "", "legacy_lib_list": []},
    "sheets": [],
    "text_variables": {},
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / f"{PROJECT}.kicad_pro").write_text(json.dumps(pro, indent=2) + "\n", encoding="utf-8")
(OUT / "sym-lib-table").write_text(
    '(sym_lib_table\n  (version 7)\n  (lib (name "TAPH_Rev0")(type "KiCad")(uri "${KIPRJMOD}/libs/TAPH_Rev0.kicad_sym")'
    '(options "")(descr "TAPH rev0 project-local symbols (DevKitC header sockets)"))\n)\n', encoding="utf-8")
(OUT / "fp-lib-table").write_text("(fp_lib_table\n  (version 7)\n)\n", encoding="utf-8")
print("project files written")
