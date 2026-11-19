"""The suite's releases of a level's vectors, for the generators.

0.1.0's file of each level is written as it was released, under vectors/.
0.2.0 releases the same vectors again, in vectors/0.2.0/, each naming its kind
and its arbiter as ids of the Zodiacs conventions registry
(https://zodiacs.org/developers/conventions/): `conventionIds`, sorted, after
`arbiter` (SPEC.md, "Files"). 0.3.0 releases them once more, in
vectors/0.3.0/, beside its new level L4. Nothing else in a vector or a file
changes, but the suite version. A generator of L1 to L3 builds its level's
document once and writes each release's file from it with write_with_ids, in
the same JSON form as 0.1.0's. L4's generator (l4/build.py) writes its own
file, with the same convention ids, from 0.3.0 on.
"""

import hashlib
import json
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))  # conformance/
# The releases that carry 0.1.0's vectors with their convention ids, in order; the last is the latest.
VERSIONS = ('0.2.0', '0.3.0')
VERSION = VERSIONS[-1]


def convention_ids(vector):
    """The registry ids a vector names: its kind and its arbiter, sorted."""
    return sorted(['kind:' + vector['kind'], 'arbiter:' + vector['arbiter']])


def with_ids(doc, version=VERSIONS[0]):
    """A later release's document of a level, from 0.1.0's: each vector with its convention ids."""
    if doc['suiteVersion'] != '0.1.0':
        raise ValueError('with_ids takes a 0.1.0 document, not %s' % doc['suiteVersion'])
    if version not in VERSIONS:
        raise ValueError('no release %s carries the convention ids' % version)
    vectors = []
    for vector in doc['vectors']:
        copy = {}
        for key, value in vector.items():
            copy[key] = value
            if key == 'arbiter':
                copy['conventionIds'] = convention_ids(vector)
        vectors.append(copy)
    return dict(doc, suiteVersion=version, vectors=vectors)


def dumps(doc, ensure_ascii):
    """A document as the generators write one."""
    return json.dumps(doc, indent=2, ensure_ascii=ensure_ascii) + '\n'


def path_with_ids(name, version=VERSION):
    """Where a release's file of the level that 0.1.0 names `name` is written."""
    return os.path.join(ROOT, 'vectors', version, name)


def write_with_ids(doc, name, ensure_ascii):
    """Write each later release's file of a level; returns, per release, its path under conformance/ and its SHA-256."""
    written = []
    for version in VERSIONS:
        text = dumps(with_ids(doc, version), ensure_ascii)
        target = path_with_ids(name, version)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'w', encoding='ascii' if ensure_ascii else 'utf-8', newline='\n') as f:
            f.write(text)
        written.append((os.path.relpath(target, ROOT), hashlib.sha256(text.encode('utf-8')).hexdigest()))
    return written
