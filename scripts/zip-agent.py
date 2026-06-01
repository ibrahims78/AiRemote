#!/usr/bin/env python3
import zipfile, os, sys

if len(sys.argv) != 3:
    print("Usage: zip-agent.py <src_dir> <dst_zip>")
    sys.exit(1)

src = sys.argv[1]
dst = sys.argv[2]

if not os.path.isdir(src):
    print(f"Error: source directory not found: {src}")
    sys.exit(1)

print(f"Zipping {src} -> {dst}")
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            fp = os.path.join(root, f)
            zf.write(fp, os.path.relpath(fp, src))

size_mb = round(os.path.getsize(dst) / 1024 / 1024, 1)
print(f"Done: {size_mb} MB")
