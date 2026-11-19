# TAI - UTC and TT - UTC from ERFA's eraDat, an outside implementation, at the
# instants src/time-scale-continuous.test.ts checks against Horizons.
#   python3 -I erfa-dat.py > results/erfa-dat.txt   (pyerfa 2.0.1.5, ERFA 2.0.1)
# ERFA warns "dubious year" for dates more than five years past its own leap
# second table; it then carries its last value, 37 s, as this engine does.
import warnings
import erfa

warnings.simplefilter("ignore")
print("pyerfa", erfa.__version__, "ERFA", erfa.version.erfa_version)
for y, m, d, f in [(2027, 10, 2, 0.0), (2028, 6, 15, 0.5), (2030, 6, 15, 0.5), (2050, 6, 15, 0.5), (2100, 6, 15, 0.5), (2199, 6, 19, 0.5)]:
    dat = erfa.dat(y, m, d, f)
    print(f"{y:04d}-{m:02d}-{d:02d} day fraction {f}: TAI-UTC {dat:.1f} s, TT-UTC {dat + 32.184:.3f} s")
