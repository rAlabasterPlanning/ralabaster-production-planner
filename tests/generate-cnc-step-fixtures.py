"""Generate known-reference STEP files for CNC drawing reader verification.

Requires: pip install cadquery. Run:
    python tests/generate-cnc-step-fixtures.py

The four examples are synthetic; they never represent production-approved NC.
"""
from pathlib import Path
import json
import cadquery as cq

ROOT = Path(__file__).parent / "fixtures" / "cnc-step"
ROOT.mkdir(parents=True, exist_ok=True)

models = {
    "cylinder": cq.Workplane("XY").circle(30).extrude(100),
    "chamfer": cq.Workplane("XY").circle(30).extrude(100).edges(">Z").chamfer(2),
    "fillet": cq.Workplane("XY").circle(30).extrude(100).edges(">Z").fillet(3),
    "hollow": cq.Workplane("XY").circle(30).circle(25).extrude(100),
}
expected = {
    "cylinder": {"lengthMm": 100, "outerDiameterMm": 60, "cylinderRadiiMm": [30]},
    "chamfer": {"lengthMm": 100, "outerDiameterMm": 60, "chamferMm": 2, "coneSemiAngleDegrees": 45},
    "fillet": {"lengthMm": 100, "outerDiameterMm": 60, "filletRadiusMm": 3, "torusMinorRadiusMm": 3},
    "hollow": {"lengthMm": 100, "outerDiameterMm": 60, "innerDiameterMm": 50, "cylinderRadiiMm": [25, 30]},
}
for name, model in models.items():
    cq.exporters.export(model, str(ROOT / (name + ".step")))
(ROOT / "expected.json").write_text(json.dumps(expected, indent=2) + "\n")
print("Four STEP test fixtures generated under", ROOT)
