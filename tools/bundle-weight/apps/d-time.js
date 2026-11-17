// App (d): timeBasis from @zodiacs/engine/time, which loads no ephemeris.
import { timeBasis } from "@zodiacs/engine/time";
import { report } from "./report.js";

const basis = timeBasis(Date.UTC(2000, 0, 1, 12));
report("d", { keys: Object.keys(basis).length });
