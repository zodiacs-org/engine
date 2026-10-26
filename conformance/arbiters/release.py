"""The suite's releases of a level's vectors, for the generators.

0.1.0's file of each level is written as it was released, under vectors/.
0.2.0 releases the same vectors again, in vectors/0.2.0/, each naming its kind
and its arbiter as ids of the Zodiacs conventions registry
(https://zodiacs.org/developers/conventions/): `conventionIds`, sorted, after
`arbiter` (SPEC.md, "Convention ids"). Nothing else in a vector or a file
changes, but the suite version. A generator builds its level's document once
and writes 0.2.0's file from it with write_with_ids, in the same JSON form as
0.1.0's.
"""

import hashlib
import json
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))  # conformance/
VERSION = '0.2.0'


def convention_ids(vector):
    """The registry ids a vector names: its kind and its arbiter, sorted."""
    return sorted(['kind:' + vector['kind'], 'arbiter:' + vector['arbiter']])


def with_ids(doc):
    """0.2.0's document of a level, from 0.1.0's."""
    if doc['suiteVersion'] != '0.1.0':
        raise ValueError('with_ids takes a 0.1.0 document, not %s' % doc['suiteVersion'])
    vectors = []
    for vector in doc['vectors']:
        copy = {}
        for key, value in vector.items():
            copy[key] = value
            if key == 'arbiter':
                copy['conventionIds'] = convention_ids(vector)
        vectors.append(copy)
    return dict(doc, suiteVersion=VERSION, vectors=vectors)


def dumps(doc, ensure_ascii):
    """A document as the generators write one."""
    return json.dumps(doc, indent=2, ensure_ascii=ensure_ascii) + '\n'


def path_with_ids(name):
    """Where 0.2.0's file of the level that 0.1.0 names `name` is written."""
    return os.path.join(ROOT, 'vectors', VERSION, name)


def write_with_ids(doc, name, ensure_ascii):
    """Write 0.2.0's file of a level; returns its path under conformance/ and its SHA-256."""
    text = dumps(with_ids(doc), ensure_ascii)
    target = path_with_ids(name)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, 'w', encoding='ascii' if ensure_ascii else 'utf-8', newline='\n') as f:
        f.write(text)
    return os.path.relpath(target, ROOT), hashlib.sha256(text.encode('utf-8')).hexdigest()
