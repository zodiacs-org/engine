#!/usr/bin/env python3
"""Runs docs/evidence/rc14-20260928/declination-truth.py (with its apparent.py)
unchanged, but through this directory's engine-at-tt.mjs, which gives each
instant to an engine from 0.1.1-rc.15 on at exactly the intended TT.

usage: python declination-truth.py <dist/index.js> <de440s.bsp> <out.json>

Needs numpy, pyerfa and jplephem, and JPL's de440s.bsp. No Swiss Ephemeris code
or output is used.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RC14 = os.path.normpath(os.path.join(HERE, "../../rc14-20260928"))
sys.path.insert(0, RC14)
spec = importlib.util.spec_from_file_location("declination_truth", os.path.join(RC14, "declination-truth.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.HERE = HERE
module.main()
