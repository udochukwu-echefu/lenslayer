"""Restore the pre-reference theme without discarding later unrelated CSS edits."""
from pathlib import Path
import hashlib
import json
import sys

backup = Path(__file__).resolve().parent
root = backup.parents[2]
manifest = json.loads((backup / "restore-manifest.json").read_text())
writes = []
errors = []
for name, block_file in manifest.pop("css").items():
    target = root / name
    text = target.read_text()
    block = (backup / block_file).read_text()
    if text.count(block) != 1:
        errors.append(f"Theme block changed or already removed: {name}")
    else:
        writes.append((target, text.replace(block, "", 1).encode()))
for name, item in manifest.items():
    target = root / name
    if hashlib.sha256(target.read_bytes()).hexdigest() != item["applied_sha256"]:
        errors.append(f"File changed since the redesign: {name}")
    else:
        writes.append((target, (backup / item["backup"]).read_bytes()))
if errors:
    sys.exit("No files changed.\n" + "\n".join(errors))
if "--check" in sys.argv:
    print(f"Ready to restore {len(writes)} files. No files changed.")
else:
    for target, content in writes:
        target.write_bytes(content)
    print("Previous theme restored. Reload both applications.")
