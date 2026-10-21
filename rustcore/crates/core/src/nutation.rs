//! Nutation, obliquity and apparent sidereal time translated from
//! `src/nutation.ts`, `src/houses.ts` and `src/ephemeris.ts`.
//!
//! The IAU 2000B series is a direct transcription of the TypeScript table,
//! which comes from US Naval Observatory NOVAS C 3.1, `iau2000b` in
//! `nutation.c`. NOVAS is a US Government work not subject to copyright.
//! The repository's `LICENSING.md` records the source and its digests.
//! Sidereal time retains the astronomy-engine 2.1.19 arithmetic translated
//! by `src/ephemeris.ts`, Copyright (c) 2019-2023 Don Cross, MIT License.

use std::f64::consts::PI;

const DEG: f64 = PI / 180.0;
const ARCSEC: f64 = DEG / 3600.0;

/// Fundamental arguments l, l-prime, F, D and Omega: arcseconds at J2000
/// followed by arcseconds per Julian century of TT for each argument.
pub const ARGUMENTS: [f64; 10] = [
    485_868.249_036,
    1_717_915_923.217_8,
    1_287_104.793_05,
    129_596_581.048_1,
    335_779.526_232,
    1_739_527_262.847_8,
    1_072_260.703_69,
    1_602_961_601.209,
    450_160.398_036,
    -6_962_890.543_1,
];

/// Five multiplier digits per term, in NOVAS order; each stores multiplier + 2.
pub const MULTIPLIERS: &str = concat!(
    "2222322404224242222423222234043222222423324242140422403",
    "1242412242322231222312444324230242322242224442040402242",
    "4242432404124234222222422232231224324404220423220321223",
    "1244324222324440242223424224432142422243324034240402243",
    "4242321403222031124242203322422340331222024245242421242",
    "3142422232114441242221444022233342442223132323322232422",
    "1240332224122322243412464132332040332443024441222433404",
);

/// Six coefficients per term, in units of 1e-7 arcseconds: A, A-prime,
/// A-double-prime, B, B-prime, B-double-prime. Each line is a NOVAS term.
#[rustfmt::skip]
pub const COEFFICIENTS: [f64; 462] = [
    -172064161.0, -174666.0, 33386.0, 92052331.0, 9086.0, 15377.0,
    -13170906.0, -1675.0, -13696.0, 5730336.0, -3015.0, -4587.0,
    -2276413.0, -234.0, 2796.0, 978459.0, -485.0, 1374.0,
    2074554.0, 207.0, -698.0, -897492.0, 470.0, -291.0,
    1475877.0, -3633.0, 11817.0, 73871.0, -184.0, -1924.0,
    -516821.0, 1226.0, -524.0, 224386.0, -677.0, -174.0,
    711159.0, 73.0, -872.0, -6750.0, 0.0, 358.0,
    -387298.0, -367.0, 380.0, 200728.0, 18.0, 318.0,
    -301461.0, -36.0, 816.0, 129025.0, -63.0, 367.0,
    215829.0, -494.0, 111.0, -95929.0, 299.0, 132.0,
    128227.0, 137.0, 181.0, -68982.0, -9.0, 39.0,
    123457.0, 11.0, 19.0, -53311.0, 32.0, -4.0,
    156994.0, 10.0, -168.0, -1235.0, 0.0, 82.0,
    63110.0, 63.0, 27.0, -33228.0, 0.0, -9.0,
    -57976.0, -63.0, -189.0, 31429.0, 0.0, -75.0,
    -59641.0, -11.0, 149.0, 25543.0, -11.0, 66.0,
    -51613.0, -42.0, 129.0, 26366.0, 0.0, 78.0,
    45893.0, 50.0, 31.0, -24236.0, -10.0, 20.0,
    63384.0, 11.0, -150.0, -1220.0, 0.0, 29.0,
    -38571.0, -1.0, 158.0, 16452.0, -11.0, 68.0,
    32481.0, 0.0, 0.0, -13870.0, 0.0, 0.0,
    -47722.0, 0.0, -18.0, 477.0, 0.0, -25.0,
    -31046.0, -1.0, 131.0, 13238.0, -11.0, 59.0,
    28593.0, 0.0, -1.0, -12338.0, 10.0, -3.0,
    20441.0, 21.0, 10.0, -10758.0, 0.0, -3.0,
    29243.0, 0.0, -74.0, -609.0, 0.0, 13.0,
    25887.0, 0.0, -66.0, -550.0, 0.0, 11.0,
    -14053.0, -25.0, 79.0, 8551.0, -2.0, -45.0,
    15164.0, 10.0, 11.0, -8001.0, 0.0, -1.0,
    -15794.0, 72.0, -16.0, 6850.0, -42.0, -5.0,
    21783.0, 0.0, 13.0, -167.0, 0.0, 13.0,
    -12873.0, -10.0, -37.0, 6953.0, 0.0, -14.0,
    -12654.0, 11.0, 63.0, 6415.0, 0.0, 26.0,
    -10204.0, 0.0, 25.0, 5222.0, 0.0, 15.0,
    16707.0, -85.0, -10.0, 168.0, -1.0, 10.0,
    -7691.0, 0.0, 44.0, 3268.0, 0.0, 19.0,
    -11024.0, 0.0, -14.0, 104.0, 0.0, 2.0,
    7566.0, -21.0, -11.0, -3250.0, 0.0, -5.0,
    -6637.0, -11.0, 25.0, 3353.0, 0.0, 14.0,
    -7141.0, 21.0, 8.0, 3070.0, 0.0, 4.0,
    -6302.0, -11.0, 2.0, 3272.0, 0.0, 4.0,
    5800.0, 10.0, 2.0, -3045.0, 0.0, -1.0,
    6443.0, 0.0, -7.0, -2768.0, 0.0, -4.0,
    -5774.0, -11.0, -15.0, 3041.0, 0.0, -5.0,
    -5350.0, 0.0, 21.0, 2695.0, 0.0, 12.0,
    -4752.0, -11.0, -3.0, 2719.0, 0.0, -3.0,
    -4940.0, -11.0, -21.0, 2720.0, 0.0, -9.0,
    7350.0, 0.0, -8.0, -51.0, 0.0, 4.0,
    4065.0, 0.0, 6.0, -2206.0, 0.0, 1.0,
    6579.0, 0.0, -24.0, -199.0, 0.0, 2.0,
    3579.0, 0.0, 5.0, -1900.0, 0.0, 1.0,
    4725.0, 0.0, -6.0, -41.0, 0.0, 3.0,
    -3075.0, 0.0, -2.0, 1313.0, 0.0, -1.0,
    -2904.0, 0.0, 15.0, 1233.0, 0.0, 7.0,
    4348.0, 0.0, -10.0, -81.0, 0.0, 2.0,
    -2878.0, 0.0, 8.0, 1232.0, 0.0, 4.0,
    -4230.0, 0.0, 5.0, -20.0, 0.0, -2.0,
    -2819.0, 0.0, 7.0, 1207.0, 0.0, 3.0,
    -4056.0, 0.0, 5.0, 40.0, 0.0, -2.0,
    -2647.0, 0.0, 11.0, 1129.0, 0.0, 5.0,
    -2294.0, 0.0, -10.0, 1266.0, 0.0, -4.0,
    2481.0, 0.0, -7.0, -1062.0, 0.0, -3.0,
    2179.0, 0.0, -2.0, -1129.0, 0.0, -2.0,
    3276.0, 0.0, 1.0, -9.0, 0.0, 0.0,
    -3389.0, 0.0, 5.0, 35.0, 0.0, -2.0,
    3339.0, 0.0, -13.0, -107.0, 0.0, 1.0,
    -1987.0, 0.0, -6.0, 1073.0, 0.0, -2.0,
    -1981.0, 0.0, 0.0, 854.0, 0.0, 0.0,
    4026.0, 0.0, -353.0, -553.0, 0.0, -139.0,
    1660.0, 0.0, -5.0, -710.0, 0.0, -2.0,
    -1521.0, 0.0, 9.0, 647.0, 0.0, 4.0,
    1314.0, 0.0, 0.0, -700.0, 0.0, 0.0,
    -1283.0, 0.0, 0.0, 672.0, 0.0, 0.0,
    -1331.0, 0.0, 8.0, 663.0, 0.0, 4.0,
    1383.0, 0.0, -2.0, -594.0, 0.0, -2.0,
    1405.0, 0.0, 4.0, -610.0, 0.0, 2.0,
    1290.0, 0.0, 0.0, -556.0, 0.0, 0.0,
];

/// Planetary offsets added to longitude and obliquity nutation, arcseconds.
pub const OFFSETS: [f64; 2] = [-0.000135, 0.000388];

/// Number of luni-solar terms in the full IAU 2000B series.
pub const NUTATION_TERMS: usize = 77;

/// Nutation in arcseconds, with the fundamental argument Omega in radians.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Nutation {
    pub dpsi: f64,
    pub deps: f64,
    pub om: f64,
}

fn argument_products(t: f64) -> ([f64; 35], [f64; 35], f64) {
    let mut re = [0.0; 35];
    let mut im = [0.0; 35];
    let mut om = 0.0;
    for j in 0..5 {
        let f = ((ARGUMENTS[2 * j] + t * ARGUMENTS[2 * j + 1]) % 1_296_000.0) * ARCSEC;
        let cos = f.cos();
        let sin = f.sin();
        let o = 7 * j;
        re[o + 1] = cos;
        im[o + 1] = -sin;
        re[o + 2] = 1.0;
        im[o + 2] = 0.0;
        for k in (o + 3)..(o + 7) {
            re[k] = re[k - 1] * cos - im[k - 1] * sin;
            im[k] = re[k - 1] * sin + im[k - 1] * cos;
        }
        re[o] = re[o + 4];
        im[o] = -im[o + 4];
        om = f;
    }
    (re, im, om)
}

/// Nutation from the first `terms` terms and both fixed offsets, evaluated
/// at Julian centuries of TT from J2000. The full model uses `NUTATION_TERMS`.
pub fn nutation(t: f64, terms: usize) -> Nutation {
    let (re, im, om) = argument_products(t);
    if terms > NUTATION_TERMS {
        // JavaScript reads beyond the coefficient table and produces NaN.
        // Avoid an index panic and preserve that observable result.
        return Nutation {
            dpsi: f64::NAN,
            deps: f64::NAN,
            om,
        };
    }
    let mut dp = 0.0;
    let mut de = 0.0;
    let multipliers = MULTIPLIERS.as_bytes();
    // Keep the original summation order: smallest contribution first.
    for i in (0..terms).rev() {
        let mut cos = 1.0;
        let mut sin = 0.0;
        for j in 0..5 {
            let k = 7 * j + usize::from(multipliers[5 * i + j] - b'0');
            let next = cos * re[k] - sin * im[k];
            sin = cos * im[k] + sin * re[k];
            cos = next;
        }
        let k = 6 * i;
        dp += (COEFFICIENTS[k] + COEFFICIENTS[k + 1] * t) * sin + COEFFICIENTS[k + 2] * cos;
        de += (COEFFICIENTS[k + 3] + COEFFICIENTS[k + 4] * t) * cos + COEFFICIENTS[k + 5] * sin;
    }
    Nutation {
        dpsi: dp * 1e-7 + OFFSETS[0],
        deps: de * 1e-7 + OFFSETS[1],
        om,
    }
}

/// Preserve the TypeScript helper's number-valued term argument, including
/// fractional indexing and NaN. Ordinary integer counts use `nutation`.
/// Positive infinity returns NaN instead of entering an infinite loop; the
/// TypeScript wrapper rejects that argument before calling this kernel.
pub fn nutation_with_terms(t: f64, terms: f64) -> Nutation {
    if terms.is_nan() || terms < 1.0 {
        return nutation(t, 0);
    }
    if terms >= 78.0 {
        // The first iteration reads past all coefficients. Both sums become
        // NaN permanently, so no possibly enormous loop is necessary.
        return nutation(t, NUTATION_TERMS + 1);
    }
    if terms.fract() == 0.0 {
        return nutation(t, terms as usize);
    }
    let (re, im, om) = argument_products(t);
    let mut dp = 0.0;
    let mut de = 0.0;
    let mut i = terms - 1.0;
    while i >= 0.0 {
        let mut cos = 1.0;
        let mut sin = 0.0;
        for j in 0..5 {
            // charCodeAt truncates its positive position, unlike array indexing.
            let position = (5.0 * i + j as f64).trunc() as usize;
            let Some(digit) = MULTIPLIERS.as_bytes().get(position) else {
                return Nutation {
                    dpsi: f64::NAN,
                    deps: f64::NAN,
                    om,
                };
            };
            let k = 7 * j + usize::from(digit - b'0');
            let next = cos * re[k] - sin * im[k];
            sin = cos * im[k] + sin * re[k];
            cos = next;
        }
        let coefficient = |index: f64| {
            if index.fract() == 0.0 {
                COEFFICIENTS
                    .get(index as usize)
                    .copied()
                    .unwrap_or(f64::NAN)
            } else {
                // A fractional JavaScript array property is absent here.
                f64::NAN
            }
        };
        let k = 6.0 * i;
        dp += (coefficient(k) + coefficient(k + 1.0) * t) * sin + coefficient(k + 2.0) * cos;
        de += (coefficient(k + 3.0) + coefficient(k + 4.0) * t) * cos + coefficient(k + 5.0) * sin;
        i -= 1.0;
    }
    Nutation {
        dpsi: dp * 1e-7 + OFFSETS[0],
        deps: de * 1e-7 + OFFSETS[1],
        om,
    }
}

/// IAU 2006 mean obliquity in degrees at Julian centuries of TT from J2000.
pub fn mean_obliquity(t: f64) -> f64 {
    // Preserve the source's mixed multiplication and exponentiation order.
    let arcseconds = 84381.406 - 46.836769 * t - 0.0001831 * t * t + 0.0020034 * t.powf(3.0)
        - 0.000000576 * t.powf(4.0)
        - 0.0000000434 * t.powf(5.0);
    arcseconds / 3600.0
}

/// Nutation and obliquity of date, including the equation of the equinoxes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tilt {
    /// Longitude nutation, arcseconds.
    pub dpsi: f64,
    /// Obliquity nutation, arcseconds.
    pub deps: f64,
    /// Mean obliquity, degrees.
    pub mobl: f64,
    /// True obliquity, degrees.
    pub tobl: f64,
    /// Equation of the equinoxes, arcseconds.
    pub ee: f64,
}

/// Evaluate the tilt at TT days from J2000, with the source's two largest
/// complementary terms of IERS Conventions (2010), table 5.2e.
pub fn tilt(tt: f64) -> Tilt {
    let t = tt / 36_525.0;
    let Nutation { dpsi, deps, om } = nutation(t, NUTATION_TERMS);
    let mobl = mean_obliquity(t);
    Tilt {
        dpsi,
        deps,
        mobl,
        tobl: mobl + deps / 3600.0,
        ee: dpsi * (mobl * DEG).cos() + 0.00264096 * om.sin() + 0.00006352 * (2.0 * om).sin(),
    }
}

/// Greenwich apparent sidereal time, hours, from UT1 and TT days since J2000.
/// Both clocks are used on every call; there is no cache keyed by TT alone.
pub fn gast_hours(ut: f64, tt: f64) -> f64 {
    let t = tt / 36525.0;
    let eqeq = tilt(tt).ee;
    let thet1 = 0.779057273264 + 0.00273781191135448 * ut;
    let thet3 = ut % 1.0;
    let mut theta = 360.0 * ((thet1 + thet3) % 1.0);
    if theta < 0.0 {
        theta += 360.0;
    }
    let st = eqeq
        + 0.014506
        + ((((-0.0000000368 * t - 0.000029956) * t - 0.00000044) * t + 1.3915817) * t
            + 4612.156534)
            * t;
    let mut gst = ((st / 3600.0 + theta) % 360.0) / 15.0;
    if gst < 0.0 {
        gst += 24.0;
    }
    gst
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tables_have_a_complete_valid_row_for_each_term() {
        assert_eq!(ARGUMENTS.len(), 10);
        assert_eq!(MULTIPLIERS.len(), 5 * NUTATION_TERMS);
        assert_eq!(COEFFICIENTS.len(), 6 * NUTATION_TERMS);
        assert!(MULTIPLIERS
            .bytes()
            .all(|digit| (b'0'..=b'6').contains(&digit)));
    }

    #[test]
    fn zero_terms_retains_offsets_and_out_of_table_terms_propagate_nan() {
        for t in [-2.0, -1.0, -0.0, 0.0, 1.0, 2.0] {
            let zero = nutation(t, 0);
            assert_eq!(zero.dpsi.to_bits(), OFFSETS[0].to_bits());
            assert_eq!(zero.deps.to_bits(), OFFSETS[1].to_bits());
            assert_eq!(zero.om.to_bits(), nutation(t, NUTATION_TERMS).om.to_bits());
            for terms in [NUTATION_TERMS + 1, usize::MAX] {
                let invalid = nutation(t, terms);
                assert!(invalid.dpsi.is_nan());
                assert!(invalid.deps.is_nan());
                assert_eq!(invalid.om.to_bits(), zero.om.to_bits());
            }
        }
    }

    #[test]
    fn number_valued_term_counts_keep_reference_indexing() {
        for t in [-2.0, 0.0, 2.0] {
            for terms in 0..=NUTATION_TERMS {
                assert_eq!(nutation_with_terms(t, terms as f64), nutation(t, terms));
            }
            for terms in [f64::NAN, f64::NEG_INFINITY, -1.0, -0.0, 0.5] {
                assert_eq!(nutation_with_terms(t, terms), nutation(t, 0));
            }
            for terms in [1.0000000000000002, 1.2, 77.5, 78.0, f64::MAX, f64::INFINITY] {
                let value = nutation_with_terms(t, terms);
                assert!(value.dpsi.is_nan());
                assert!(value.deps.is_nan());
                assert_eq!(value.om.to_bits(), nutation(t, 0).om.to_bits());
            }
        }
        // Regression values from this checkout's src/nutation.ts, evaluated
        // on Node 22.23.3. These check compatibility, not astronomical accuracy.
        // The allowance covers native versus JavaScript trig implementation.
        for (terms, dpsi, deps) in [
            (1.5, 9.190003391871796, 0.07419715772519524),
            (2.5, 9.751797223686848, 0.11951592923410595),
            (38.5, 9.900511380206776, 0.23630807513163024),
            (76.5, 9.900726320950872, 0.23824827066638365),
        ] {
            let value = nutation_with_terms(0.0, terms);
            assert!((value.dpsi - dpsi).abs() <= 1e-12);
            assert!((value.deps - deps).abs() <= 1e-12);
        }
    }

    #[test]
    fn complex_products_match_direct_argument_trigonometry() {
        // Alternate evaluation of the same series is an arithmetic invariant,
        // not an independent accuracy reference. It catches multiplier indices
        // and sine/cosine signs, including every truncated prefix of the series.
        for sample in 0..=100 {
            let t = -2.0 + f64::from(sample) / 25.0;
            let arguments: [f64; 5] = std::array::from_fn(|j| {
                ((ARGUMENTS[2 * j] + t * ARGUMENTS[2 * j + 1]) % 1_296_000.0) * ARCSEC
            });
            for terms in 0..=NUTATION_TERMS {
                let mut dp = 0.0;
                let mut de = 0.0;
                for i in (0..terms).rev() {
                    let angle: f64 = arguments
                        .iter()
                        .enumerate()
                        .map(|(j, argument)| {
                            f64::from(i32::from(MULTIPLIERS.as_bytes()[5 * i + j]) - 50) * argument
                        })
                        .sum();
                    let c = &COEFFICIENTS[(6 * i)..(6 * i + 6)];
                    dp += (c[0] + c[1] * t) * angle.sin() + c[2] * angle.cos();
                    de += (c[3] + c[4] * t) * angle.cos() + c[5] * angle.sin();
                }
                let actual = nutation(t, terms);
                assert!((actual.dpsi - (dp * 1e-7 + OFFSETS[0])).abs() <= 1e-12);
                assert!((actual.deps - (de * 1e-7 + OFFSETS[1])).abs() <= 1e-12);
            }
        }
    }

    #[test]
    fn obliquity_epoch_and_true_tilt_keep_their_units() {
        assert_eq!(
            mean_obliquity(0.0).to_bits(),
            (84381.406_f64 / 3600.0).to_bits()
        );
        let start = mean_obliquity(-2.0);
        let end = mean_obliquity(2.0);
        assert!(start > mean_obliquity(0.0));
        assert!(end < mean_obliquity(0.0));
        for tt in [-73_050.0, -36_525.0, 0.0, 36_525.0, 73_050.0] {
            let at = tilt(tt);
            assert_eq!(at.mobl.to_bits(), mean_obliquity(tt / 36_525.0).to_bits());
            assert_eq!(at.tobl.to_bits(), (at.mobl + at.deps / 3600.0).to_bits());
        }
    }

    #[test]
    fn sidereal_time_wraps_and_depends_on_ut1_even_when_tt_is_identical() {
        for day in (-73_050..=73_050).step_by(31) {
            let ut = f64::from(day) + 0.875;
            let gst = gast_hours(ut, ut + 0.001);
            assert!((0.0..24.0).contains(&gst));
        }
        for tt in [-73_050.0, 0.0, 73_050.0] {
            let first = gast_hours(tt, tt);
            let second = gast_hours(tt + 0.25, tt);
            let advance = (second - first + 24.0) % 24.0;
            assert!((6.0..6.02).contains(&advance));
        }
    }

    #[test]
    fn nonfinite_clocks_propagate_nan_without_panics() {
        for time in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY] {
            let value = nutation(time, NUTATION_TERMS);
            assert!(value.dpsi.is_nan());
            assert!(value.deps.is_nan());
            assert!(value.om.is_nan());
            assert!(tilt(time).ee.is_nan());
            assert!(mean_obliquity(time).is_nan());
            assert!(gast_hours(time, 0.0).is_nan());
            assert!(gast_hours(0.0, time).is_nan());
        }
    }
}
