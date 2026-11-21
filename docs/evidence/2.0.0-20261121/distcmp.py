#!/usr/bin/env python3
"""Compare dist/ of the current checkout against the carried 2.0.0-rc.6 archive.

Normalizes the esbuild/tsup chunk hashes, declaration hashes, and the version
string ("2.0.0" -> "2.0.0-rc.6"), then verifies that every file in dist/ is
byte-identical to 2.0.0-rc.6's dist/ and that a synthetic mutation to a copy
of dist/index.js is detected.

Usage (from repository root):
    python3 docs/evidence/2.0.0-20261121/distcmp.py
"""

import hashlib
import os
import re
import shutil
import sys
import tarfile
import tempfile


def norm_list(directory, ver_from, ver_to):
    out = []
    version_files = []
    for root, _, filenames in os.walk(directory):
        for fname in filenames:
            if fname.startswith("._") or fname.startswith("metafile-"):
                continue
            full_path = os.path.join(root, fname)
            rel = os.path.relpath(full_path, directory)
            with open(full_path, "rb") as fh:
                content = fh.read().decode("utf-8", "surrogateescape")
            normalized = re.sub(r"chunk-[A-Z0-9]{8}", "chunk-H", content)
            if ver_from and ver_from in normalized:
                version_files.append(rel)
                normalized = normalized.replace(ver_from, ver_to)
            normalized = re.sub(
                r"(types|api|houses|ephemeris|time-bands|reference-span|rulers|ayanamsa|time-scale|zone-history)-[A-Za-z0-9_-]{8}\.d\.ts",
                r"\1-H.d.ts",
                normalized,
            )
            norm_name = re.sub(r"chunk-[A-Z0-9]{8}", "chunk-H", rel)
            norm_name = re.sub(
                r"(types|api|houses|ephemeris|time-bands|reference-span|rulers|ayanamsa|time-scale|zone-history)-[A-Za-z0-9_-]{8}\.d\.ts",
                r"\1-H.d.ts",
                norm_name,
            )
            digest = hashlib.sha256(
                normalized.encode("utf-8", "surrogateescape")
            ).hexdigest()
            out.append((norm_name, digest, rel, len(content)))
    return sorted(out, key=lambda item: (item[0], item[1])), sorted(version_files)


def main():
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    os.chdir(repo)
    rc6_archive = os.path.join(repo, "artifacts", "zodiacs-engine-2.0.0-rc.6.tgz")
    with tempfile.TemporaryDirectory() as tmpdir:
        with tarfile.open(rc6_archive) as tf:
            tf.extractall(tmpdir)
        rc6_files, _ = norm_list(os.path.join(tmpdir, "package", "dist"), None, None)
        cur_files, version_files = norm_list("dist", '"2.0.0"', '"2.0.0-rc.6"')
        rc6_set = {(x[0], x[1]) for x in rc6_files}
        cur_set = {(x[0], x[1]) for x in cur_files}
        only_rc6 = [x[2:] for x in rc6_files if (x[0], x[1]) not in cur_set]
        only_cur = [x[2:] for x in cur_files if (x[0], x[1]) not in rc6_set]
        verdict = "EQUAL" if not only_rc6 and not only_cur else "DIFFERENT"

        mut_dir = os.path.join(tmpdir, "mut_dist")
        shutil.copytree(
            "dist", mut_dir, ignore=shutil.ignore_patterns("._*", "metafile-*")
        )
        idx_path = os.path.join(mut_dir, "index.js")
        with open(idx_path, "r", encoding="utf-8") as fh:
            idx_src = fh.read()
        with open(idx_path, "w", encoding="utf-8") as fh:
            fh.write(idx_src + "\n// mut\n")
        mut_files, _ = norm_list(mut_dir, '"2.0.0"', '"2.0.0-rc.6"')
        mut_diff = [x[2:] for x in mut_files if (x[0], x[1]) not in rc6_set]

        lines = [
            f"files: rc.6={len(rc6_files)}, 2.0.0={len(cur_files)}",
            f"verdict: {verdict}",
            f"files containing version string (normalized): {version_files}",
            f"only in rc.6: {only_rc6}",
            f"only in 2.0.0: {only_cur}",
            f"mutation test (appending comment to copy of dist/index.js): detected diff={mut_diff}",
        ]
        out_path = os.path.join(
            repo, "docs", "evidence", "2.0.0-20261121", "results", "dist-vs-rc6.txt"
        )
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        print("\n".join(lines))

        if verdict != "EQUAL" or not mut_diff:
            sys.exit(1)


if __name__ == "__main__":
    main()
