//! Delta T model ported from `src/deltat.ts`, retaining its arithmetic order.
//!
//! Table values are generated from the checked TypeScript source at build time.
//! The historical spline values retain the CC BY 4.0 terms of Stephenson,
//! Morrison and Hohenkerk (2016), Table S15. See `rustcore/NOTICE` and the
//! repository's `LICENSING.md` for their attribution and other table sources.

use std::{f64::consts::PI, fmt, sync::OnceLock};

use crate::time_data::{
    DELTA_T_SIG, DELTA_T_SX, DELTA_T_SY, DELTA_T_TABLE_DIGEST, DELTA_T_TABLE_FROM,
    DELTA_T_TABLE_KNOTS, DELTA_T_TABLE_OBSERVED_TO, DELTA_T_TABLE_PREDICTED_TO,
    DELTA_T_TABLE_VERSION,
};

pub const DELTA_T_MODEL: &str = "zodiacs-deltat/1";

/// Delta T in seconds, its uncertainty band and the provenance of the value.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DeltaT {
    pub seconds: f64,
    pub sigma: Option<f64>,
    pub model: &'static str,
    pub table: Option<&'static str>,
    pub table_digest: Option<&'static str>,
    pub segment: &'static str,
}

/// A nonfinite UT argument, retaining the source API's error message.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DeltaTError(&'static str);

impl fmt::Display for DeltaTError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}

impl std::error::Error for DeltaTError {}

struct Model {
    x: Vec<f64>,
    y: Vec<f64>,
    m: Vec<f64>,
    kx: Vec<f64>,
    kv: Vec<f64>,
    observed: f64,
    predicted: f64,
    slope: f64,
}

static MODEL: OnceLock<Model> = OnceLock::new();

fn year_of_mjd(mjd: f64) -> f64 {
    2000.0 + (mjd - 51544.5) / 365.25
}

fn long_term(year: f64) -> f64 {
    let t = (year - 1825.0) / 100.0;
    36.525 * (0.89 * t * t + (30.0 / PI) * ((PI * t) / 7.5).cos())
}

fn long_term_rate(year: f64) -> f64 {
    let t = (year - 1825.0) / 100.0;
    0.36525 * (1.78 * t - 4.0 * ((PI * t) / 7.5).sin())
}

impl Model {
    fn new() -> Self {
        let mut x = DELTA_T_SX.to_vec();
        for year in (1850..=1945).step_by(5) {
            x.push(f64::from(year));
        }
        let y: Vec<_> = DELTA_T_SY.iter().map(|value| value / 100.0).collect();
        let n = x.len() - 1;
        let mut m = vec![0.0; x.len()];
        let mut c = vec![0.0; n];
        let mut r = vec![0.0; n];
        m[0] = 0.018915;
        r[0] = 0.018915;
        for i in 1..n {
            let a = x[i] - x[i - 1];
            let b = x[i + 1] - x[i];
            let p = 2.0 * (a + b) - a * c[i - 1];
            c[i] = b / p;
            r[i] = (6.0 * ((y[i + 1] - y[i]) / b - (y[i] - y[i - 1]) / a) - a * r[i - 1]) / p;
        }
        m[n] = -0.09856;
        for i in (1..n).rev() {
            m[i] = r[i] - c[i] * m[i + 1];
        }

        let observed = year_of_mjd(DELTA_T_TABLE_OBSERVED_TO);
        let predicted = year_of_mjd(DELTA_T_TABLE_PREDICTED_TO);
        let mut total = 0.0;
        let kv: Vec<_> = DELTA_T_TABLE_KNOTS
            .iter()
            .map(|step| {
                total += step;
                total / 100.0
            })
            .collect();
        let years = kv.len() - 5;
        let mut kx: Vec<_> = (0..years).map(|i| DELTA_T_TABLE_FROM + i as f64).collect();
        for k in 0..5 {
            kx.push(observed + (f64::from(k) * (predicted - observed)) / 4.0);
        }
        let slope = (kv[years + 4] - kv[years]) / (predicted - observed);
        Self {
            x,
            y,
            m,
            kx,
            kv,
            observed,
            predicted,
            slope,
        }
    }

    fn seconds(&self, t: f64) -> f64 {
        if t < -720.0 {
            return self.y[0] + long_term(t) - long_term(-720.0);
        }
        if t < 1941.0 {
            let mut i = self.x.len() - 2;
            while t < self.x[i] {
                i -= 1;
            }
            let h = self.x[i + 1] - self.x[i];
            let a = self.x[i + 1] - t;
            let b = t - self.x[i];
            // The source uses exponentiation, not chained multiplication.
            return (self.m[i] * a.powf(3.0) + self.m[i + 1] * b.powf(3.0)) / (6.0 * h)
                + (self.y[i] / h - (self.m[i] * h) / 6.0) * a
                + (self.y[i + 1] / h - (self.m[i + 1] * h) / 6.0) * b;
        }
        let n = self.kx.len() - 1;
        if t <= self.kx[n] {
            let i = if t < self.observed {
                (t - 1941.0).floor() as usize
            } else {
                n - 4
                    + ((4.0 * (t - self.observed)) / (self.predicted - self.observed))
                        .floor()
                        .min(3.0) as usize
            };
            return self.kv[i]
                + ((t - self.kx[i]) * (self.kv[i + 1] - self.kv[i]))
                    / (self.kx[i + 1] - self.kx[i]);
        }
        let g = t - self.predicted;
        self.kv[n] + self.slope * 15.0 * (1.0 - (-g / 15.0).exp()) + long_term(t)
            - long_term(self.predicted)
            - long_term_rate(self.predicted) * g
    }

    fn sigma(&self, t: f64) -> f64 {
        let h = t - self.observed;
        if h > 0.0 {
            return if h <= 1.0 {
                0.03 + 0.09 * h.powf(0.75)
            } else if h <= 10.0 {
                0.12 * h.powf(1.5)
            } else {
                0.61 * h - 2.3052668
            };
        }
        if t >= 1956.0 {
            return 0.03;
        }
        let c = (t - 1825.0) / 100.0;
        let mut v = if t < 1620.0 { 0.6 * c * c } else { 0.0 };
        if t >= 640.0 {
            let mut i = 0;
            while t >= DELTA_T_SIG[i + 2] {
                i += 2;
            }
            v = v.max(
                DELTA_T_SIG[i + 1]
                    + ((t - DELTA_T_SIG[i]) * (DELTA_T_SIG[i + 3] - DELTA_T_SIG[i + 1]))
                        / (DELTA_T_SIG[i + 2] - DELTA_T_SIG[i]),
            );
        }
        v
    }

    fn segment(&self, t: f64) -> &'static str {
        if t < -720.0 {
            "long-term"
        } else if t < 1956.0 {
            "reconstructed"
        } else if t <= self.observed {
            "observed"
        } else if t <= self.predicted {
            "predicted"
        } else {
            "extrapolated"
        }
    }
}

/// Model Delta T for UT1 days since 2000-01-01T12:00, including provenance.
///
/// Rejects nonfinite input. Finite extreme input can produce infinite output,
/// as in the source; the model does not restrict its input to a Date range.
pub fn delta_t_at(ut: f64) -> Result<DeltaT, DeltaTError> {
    if !ut.is_finite() {
        return Err(DeltaTError(
            "deltaTAt takes a finite UT: days since 2000-01-01T12:00 on UT1.",
        ));
    }
    let t = 2000.0 + ut / 365.25;
    let model = MODEL.get_or_init(Model::new);
    Ok(DeltaT {
        seconds: model.seconds(t),
        sigma: Some(model.sigma(t)),
        model: DELTA_T_MODEL,
        table: Some(DELTA_T_TABLE_VERSION),
        table_digest: Some(DELTA_T_TABLE_DIGEST),
        segment: model.segment(t),
    })
}

/// Model TT minus UT1 in seconds, for UT1 days since 2000-01-01T12:00.
/// No allocation occurs after the model's first use.
pub fn delta_t(ut: f64) -> Result<f64, DeltaTError> {
    if !ut.is_finite() {
        return Err(DeltaTError(
            "deltaT takes a finite UT: days since 2000-01-01T12:00 on UT1.",
        ));
    }
    Ok(MODEL.get_or_init(Model::new).seconds(2000.0 + ut / 365.25))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ut(year: f64) -> f64 {
        (year - 2000.0) * 365.25
    }

    #[test]
    fn returns_provenance_and_the_same_seconds_on_both_paths() {
        for year in [-3000.0, -720.0, 0.0, 1800.0, 1941.0, 2000.0, 2027.0, 2200.0] {
            let actual = delta_t_at(ut(year)).unwrap();
            assert_eq!(
                actual.seconds.to_bits(),
                delta_t(ut(year)).unwrap().to_bits()
            );
            assert_eq!(actual.model, DELTA_T_MODEL);
            assert_eq!(actual.table, Some(DELTA_T_TABLE_VERSION));
            assert_eq!(actual.table_digest, Some(DELTA_T_TABLE_DIGEST));
            assert!(actual.sigma.unwrap() >= 0.0);
        }
    }

    #[test]
    fn preserves_every_segment_boundary() {
        let model = MODEL.get_or_init(Model::new);
        for (year, expected) in [
            (-720.000_001, "long-term"),
            (-720.0, "reconstructed"),
            (1_955.999_999, "reconstructed"),
            (1956.0, "observed"),
            (model.observed, "observed"),
            (model.observed + 0.000_001, "predicted"),
            (model.predicted, "predicted"),
            (model.predicted + 0.000_001, "extrapolated"),
        ] {
            assert_eq!(delta_t_at(ut(year)).unwrap().segment, expected, "{year}");
        }
        // The known 1941 step belongs to the reference model. Its first table
        // value must not be blended with the historical spline on the left.
        assert_eq!(
            delta_t(ut(1941.0)).unwrap().to_bits(),
            (DELTA_T_TABLE_KNOTS[0] / 100.0).to_bits()
        );
        assert_ne!(model.seconds(1941.0), model.seconds(1941.0 - 1e-7));
    }

    #[test]
    fn decoded_table_reaches_knots_and_is_linear_between_them() {
        let model = MODEL.get_or_init(Model::new);
        let mut accumulated = 0.0;
        for (i, step) in DELTA_T_TABLE_KNOTS.iter().enumerate() {
            accumulated += step;
            assert_eq!(model.kv[i].to_bits(), (accumulated / 100.0).to_bits());
            assert_eq!(model.seconds(model.kx[i]).to_bits(), model.kv[i].to_bits());
        }
        // Whole-year midpoints are exact binary inputs, so no coordinate
        // rounding allowance is necessary to check this interpolation.
        for i in 0..(model.kx.len() - 6) {
            assert_eq!(
                model.seconds(model.kx[i] + 0.5).to_bits(),
                (model.kv[i] + 0.5 * (model.kv[i + 1] - model.kv[i])).to_bits()
            );
        }
    }

    #[test]
    fn historical_sigma_and_observed_band_follow_the_reference_branches() {
        let model = MODEL.get_or_init(Model::new);
        for (year, expected) in [(1800.0, 1.5_f64), (1900.0, 0.46), (1956.0, 0.03)] {
            assert_eq!(model.sigma(year).to_bits(), expected.to_bits());
        }
        assert_eq!(model.sigma(model.observed).to_bits(), 0.03_f64.to_bits());
        for year in [-5000.0, -720.0, 0.0, 1000.0, 1500.0] {
            let centuries = (year - 1825.0) / 100.0;
            assert!(model.sigma(year) >= 0.6 * centuries * centuries);
        }
        let mut previous = model.sigma(model.observed);
        for step in 1..=1600 {
            let value = model.sigma(model.observed + f64::from(step) / 4.0);
            assert!(value >= previous);
            previous = value;
        }
    }

    #[test]
    fn stays_finite_for_synthetic_daily_inputs_from_1800_through_2200() {
        let mut day = ut(1800.0);
        while day <= ut(2200.0) {
            let actual = delta_t_at(day).unwrap();
            assert!(actual.seconds.is_finite());
            assert!(actual.sigma.unwrap().is_finite());
            assert!(actual.sigma.unwrap() >= 0.0);
            day += 1.0;
        }
    }

    #[test]
    fn accepts_finite_extremes_and_rejects_only_nonfinite_input() {
        for value in [f64::MAX, -f64::MAX, 0.0, -0.0, f64::from_bits(1)] {
            assert!(delta_t(value).is_ok());
            assert!(delta_t_at(value).is_ok());
        }
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                delta_t(value).unwrap_err().to_string(),
                "deltaT takes a finite UT: days since 2000-01-01T12:00 on UT1."
            );
            assert_eq!(
                delta_t_at(value).unwrap_err().to_string(),
                "deltaTAt takes a finite UT: days since 2000-01-01T12:00 on UT1."
            );
        }
    }
}
