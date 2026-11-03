// T12 (../PREREGISTRATION.md, section 6): the declarations zodiacs.org
// commits for its time-basis bundle (src/lib/engine/time-basis.d.mts at site
// main 9a67f761, SHA-256 8cc3670eb2aae747a2e22e667633594b8d24f7f6982dfcee2c0ffc2a2cff6ff9)
// and @zodiacs/engine/time's agree: each of the nine types below is assignable
// both ways, and the package's EPHEMERIS_SPAN is assignable to the site's.
// Compiled, never run, by declarations.sh beside this file, with TypeScript
// 5.9.3 (--strict, --noEmit, NodeNext), the site's file copied beside it as
// site/time-basis.d.mts. A type that does not hold is a compile error here.
import type * as Site from "./site/time-basis.mjs";
import type * as Engine from "@zodiacs/engine/time";

type Both<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type OneWay<A, B> = [A] extends [B] ? true : false;
type Holds<T extends true> = T;

export type T12 = [
  Holds<Both<typeof Site.timeBasis, typeof Engine.timeBasis>>,
  Holds<Both<typeof Site.elapsedDays, typeof Engine.elapsedDays>>,
  Holds<Both<typeof Site.tilt, typeof Engine.tilt>>,
  Holds<Both<typeof Site.eclipticFrame, typeof Engine.eclipticFrame>>,
  Holds<Both<typeof Site.meanEcliptic, typeof Engine.meanEcliptic>>,
  Holds<Both<typeof Site.eclipticOfDate, typeof Engine.eclipticOfDate>>,
  Holds<Both<Site.TimeBasis, Engine.TimeBasis>>,
  Holds<Both<Site.Tilt, Engine.Tilt>>,
  Holds<Both<Site.EclipticFrame, Engine.EclipticFrame>>,
  Holds<OneWay<typeof Engine.EPHEMERIS_SPAN, typeof Site.EPHEMERIS_SPAN>>
];
