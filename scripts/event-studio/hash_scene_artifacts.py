"""Write final artifact hashes for private storage replacement and handoff verification."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc'
files=[OUT/'Royal-Bahrain-Concours-2026.blend',OUT/'Royal-Concours-Editable-Kit.zip',*sorted((OUT/'renders').glob('[0-9][0-9]-*.png')),OUT/'blender-roundtrip-report.json',OUT/'blender-render-report.json',OUT/'editable-kit-report.json']
report={'sourceSeedSha256':hashlib.sha256((OUT/'site-seed.json').read_bytes()).hexdigest(),'artifacts':[{'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(OUT/'scene-artifact-hashes.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
