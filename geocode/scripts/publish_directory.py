"""Publish a new directory under a cooperative sibling lock. MIT.

The parent is trusted and staging is on the destination filesystem. Normal
errors clean up owned files; process kills leave staging and a lock for recovery.
"""

from contextlib import contextmanager
from pathlib import Path
import os
import shutil
import tempfile


@contextmanager
def publish_directory(output):
    output = Path(os.path.abspath(output))
    output.parent.mkdir(parents=True, exist_ok=True)
    lock = output.parent / f".{output.name}.build-lock"
    lock.mkdir()  # Never clean up a lock acquired by another writer.
    staging = None
    try:
        if os.path.lexists(output):
            raise ValueError("Output directory must not exist")
        staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.building-", dir=output.parent))
        yield staging
        if os.path.lexists(output):
            raise ValueError("Output directory appeared during acquisition")
        staging.rename(output)
        staging = None
    finally:
        try:
            if staging is not None:
                shutil.rmtree(staging)
        finally:
            lock.rmdir()
