//! Exact decisions on binary64 values, ported from `src/exact.ts`.
//!
//! Nonoverlapping expansions retain each input double's exact rational value.
//! The error-free transformations follow the partial-sums form described in
//! the engine's implementation; only `rounded_value` rounds a reported sum.
//! `exact_sign` uses integer limbs when intermediate floating sums could
//! overflow. No additional arithmetic dependency is needed.

use std::cmp::Ordering;

/// Nonzero, nonoverlapping doubles in increasing magnitude.
pub type ExactSum = Vec<f64>;

const SAFE_MAGNITUDE: f64 = f64::from_bits(2023_u64 << 52); // 2^1000
                                                            // This count and the strict magnitude bound keep every partial below 2^1023.
const SAFE_TERM_COUNT: usize = 1 << 23;

fn add(partials: &mut ExactSum, value: f64) {
    let mut x = value;
    let mut kept = 0;
    for index in 0..partials.len() {
        let mut y = partials[index];
        if x.abs() < y.abs() {
            std::mem::swap(&mut x, &mut y);
        }
        // Fast2Sum with |x| >= |y|: high + low is exactly x + y.
        let high = x + y;
        let low = y - (high - x);
        if low != 0.0 {
            partials[kept] = low;
            kept += 1;
        }
        x = high;
    }
    partials.truncate(kept);
    if x != 0.0 {
        partials.push(x);
    }
}

/// Sum finite terms exactly, provided no partial sum can overflow.
///
/// As in `src/exact.ts`, ordinary callers use small lists with every term
/// below 2^1000 in magnitude. Use `exact_sign` for sign decisions on arbitrary
/// finite terms, including terms near the largest representable double.
pub fn exact_sum(terms: &[f64]) -> ExactSum {
    let mut partials = Vec::new();
    for &term in terms {
        add(&mut partials, term);
    }
    partials
}

/// Sum expansions and scalar singleton slices in their supplied order.
///
/// Each term must be finite and no partial sum may overflow, as for
/// `exact_sum`. For example, `exact_sum_parts(&[&distance, &[-angle]])`.
pub fn exact_sum_parts(parts: &[&[f64]]) -> ExactSum {
    let mut partials = Vec::new();
    for part in parts {
        for &term in *part {
            add(&mut partials, term);
        }
    }
    partials
}

pub fn negated(sum: &[f64]) -> ExactSum {
    sum.iter().map(|part| -part).collect()
}

/// Sign of an expansion's exact value, determined by its largest partial.
pub fn sign_of(sum: &[f64]) -> i8 {
    match sum.last() {
        None => 0,
        Some(&top) if top > 0.0 => 1,
        Some(_) => -1,
    }
}

/// Sign of a minus b, with the finite/no-overflow preconditions of `exact_sum`.
/// A scalar may be supplied as a singleton slice.
pub fn compare_exact(a: &[f64], b: &[f64]) -> i8 {
    sign_of(&exact_sum_parts(&[a, &negated(b)]))
}

/// Absolute value of an expansion, without rounding.
pub fn absolute(sum: &[f64]) -> ExactSum {
    if sign_of(sum) < 0 {
        negated(sum)
    } else {
        sum.to_vec()
    }
}

/// Round an expansion once to nearest binary64, ties to even. Zero is +0.
pub fn rounded_value(sum: &[f64]) -> f64 {
    let mut index = sum.len();
    if index == 0 {
        return 0.0;
    }
    index -= 1;
    let mut high = sum[index];
    let mut low = 0.0;
    while index > 0 {
        let x = high;
        index -= 1;
        let y = sum[index];
        high = x + y;
        low = y - (high - x);
        if low != 0.0 {
            break;
        }
    }
    let below = if index > 0 { sum[index - 1] } else { 0.0 };
    if (low < 0.0 && below < 0.0) || (low > 0.0 && below > 0.0) {
        // Terms below a half-ulp remainder decide which side of the tie the
        // exact sum occupies, even when the initial addition rounded to even.
        let twice = low * 2.0;
        let moved = high + twice;
        if moved - high == twice {
            high = moved;
        }
    }
    high
}

/// Add one word to an unsigned integer, carrying into as many limbs as needed.
fn add_word(limbs: &mut Vec<u64>, mut index: usize, mut word: u64) {
    while word != 0 {
        if index >= limbs.len() {
            limbs.resize(index + 1, 0);
        }
        let (sum, carry) = limbs[index].overflowing_add(word);
        limbs[index] = sum;
        word = u64::from(carry);
        index += 1;
    }
}

/// Add |value| * 2^1074 to an unsigned integer; finite doubles scale exactly.
fn add_scaled(limbs: &mut Vec<u64>, value: f64) {
    let bits = value.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as usize;
    let mut significand = bits & ((1_u64 << 52) - 1);
    let shift = if exponent == 0 {
        0
    } else {
        significand |= 1_u64 << 52;
        exponent - 1
    };
    let word_index = shift / 64;
    let bit_offset = shift % 64;
    add_word(limbs, word_index, significand << bit_offset);
    if bit_offset != 0 {
        add_word(limbs, word_index + 1, significand >> (64 - bit_offset));
    }
}

fn integer_sign(terms: &[f64]) -> i8 {
    // Keep positive and negative magnitudes separately. Their final comparison
    // decides the signed sum without subtraction or any intermediate overflow.
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    for &term in terms {
        if term.is_sign_negative() {
            add_scaled(&mut negative, term);
        } else {
            add_scaled(&mut positive, term);
        }
    }
    let length = positive.len().max(negative.len());
    for index in (0..length).rev() {
        let a = positive.get(index).copied().unwrap_or(0);
        let b = negative.get(index).copied().unwrap_or(0);
        match a.cmp(&b) {
            Ordering::Greater => return 1,
            Ordering::Less => return -1,
            Ordering::Equal => {}
        }
    }
    0
}

/// Sign of the exact sum of finite doubles of any magnitude.
///
/// Terms must be finite. Integer accumulation handles cancellation even when
/// floating partial sums would overflow and the remainder is subnormal.
pub fn exact_sign(terms: &[f64]) -> i8 {
    debug_assert!(terms.iter().all(|term| term.is_finite()));
    if terms.len() <= SAFE_TERM_COUNT && terms.iter().all(|term| term.abs() < SAFE_MAGNITUDE) {
        sign_of(&exact_sum(terms))
    } else {
        integer_sign(terms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Independent exact oracle: accumulate signed bits in base two instead of
    // floating expansions or the production unsigned base-2^64 limb sums.
    // The tested lists cannot carry beyond this buffer.
    fn oracle(terms: &[f64]) -> (i8, f64) {
        let mut columns = [0_i64; 2176];
        for &term in terms {
            let bits = term.to_bits();
            let exponent = ((bits >> 52) & 0x7ff) as usize;
            let mut mantissa = bits & ((1_u64 << 52) - 1);
            let shift = if exponent == 0 {
                0
            } else {
                mantissa += 1_u64 << 52;
                exponent - 1
            };
            let multiplier = if term.is_sign_negative() { -1 } else { 1 };
            for bit in 0..53 {
                columns[shift + bit] += multiplier * ((mantissa >> bit) & 1) as i64;
            }
        }
        fn normalize(columns: &mut [i64]) {
            for index in 0..columns.len() - 1 {
                columns[index + 1] += columns[index].div_euclid(2);
                columns[index] = columns[index].rem_euclid(2);
            }
        }
        let mut normalized = columns;
        normalize(&mut normalized);
        let sign = if normalized[normalized.len() - 1] < 0 {
            -1
        } else if normalized.iter().any(|&value| value != 0) {
            1
        } else {
            return (0, 0.0);
        };
        if sign < 0 {
            for column in &mut columns {
                *column = -*column;
            }
        }
        normalize(&mut columns);
        let mut top = columns.iter().rposition(|&bit| bit != 0).unwrap();
        let shift = top.saturating_sub(52);
        let mut mantissa = 0_u64;
        for bit in (shift..=top).rev() {
            mantissa = (mantissa << 1) | columns[bit] as u64;
        }
        if shift > 0
            && columns[shift - 1] == 1
            && (mantissa & 1 != 0 || columns[..shift - 1].contains(&1))
        {
            mantissa += 1;
            if mantissa == 1_u64 << 53 {
                mantissa >>= 1;
                top += 1;
            }
        }
        let bits = if top < 52 {
            mantissa
        } else if top >= 2098 {
            f64::INFINITY.to_bits()
        } else {
            ((top as u64 - 51) << 52) | (mantissa & ((1_u64 << 52) - 1))
        };
        let signed_bits = bits | if sign < 0 { 1_u64 << 63 } else { 0 };
        (sign, f64::from_bits(signed_bits))
    }

    fn next(seed: &mut u64) -> u64 {
        *seed = seed
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        *seed
    }

    #[test]
    fn ties_round_to_even_with_smaller_remainders_deciding_each_side() {
        let half = 2_f64.powi(-53);
        let small = 2_f64.powi(-200);
        for (terms, expected) in [
            (vec![1.0, half], 1.0),
            (vec![1.0, half, small], 1.0 + f64::EPSILON),
            (vec![1.0, half, -small], 1.0),
            (vec![1.0 + f64::EPSILON, half], 1.0 + 2.0 * f64::EPSILON),
            (vec![1e-16, 1.0, 1e16], 1e16 + 2.0),
        ] {
            assert_eq!(
                rounded_value(&exact_sum(&terms)).to_bits(),
                expected.to_bits()
            );
            let negatives = negated(&terms);
            assert_eq!(
                rounded_value(&exact_sum(&negatives)).to_bits(),
                (-expected).to_bits()
            );
            assert_eq!(oracle(&terms).1.to_bits(), expected.to_bits());
        }
    }

    #[test]
    fn zero_is_canonical_and_subnormal_cancellation_remains_exact() {
        let tiny = f64::from_bits(1);
        for terms in [vec![], vec![0.0, -0.0], vec![0.1, -0.1], vec![tiny, -tiny]] {
            assert_eq!(exact_sum(&terms), Vec::<f64>::new());
            assert_eq!(exact_sign(&terms), 0);
            assert_eq!(rounded_value(&exact_sum(&terms)).to_bits(), 0);
        }
        let terms = [1.0, tiny, -1.0];
        assert_eq!(exact_sum(&terms), vec![tiny]);
        assert_eq!(rounded_value(&exact_sum(&terms)).to_bits(), 1);
        assert_eq!(sign_of(&exact_sum(&negated(&terms))), -1);
    }

    #[test]
    fn decimal_boundaries_compare_without_rounding_and_parts_compose() {
        let a = exact_sum(&[0.1, 0.2]);
        assert_eq!(compare_exact(&a, &[0.3]), 1);
        assert_eq!(compare_exact(&[0.3], &a), -1);
        assert_eq!(compare_exact(&exact_sum(&[1.1, -0.1]), &[1.0]), 1);
        assert_eq!(compare_exact(&exact_sum(&[13.3, -12.3]), &[1.0]), 0);
        let b = exact_sum(&[0.1, -0.3]);
        assert_eq!(sign_of(&negated(&b)), 1);
        assert_eq!(compare_exact(&absolute(&b), &exact_sum(&[0.3, -0.1])), 0);
        assert_eq!(
            compare_exact(&exact_sum_parts(&[&a, &[360.0], &[-360.0]]), &a),
            0
        );
        assert_eq!(exact_sum_parts(&[&a, &negated(&a)]), Vec::<f64>::new());
    }

    #[test]
    fn integer_fallback_preserves_tiny_remainders_after_huge_cancellation() {
        let max = f64::MAX;
        let tiny = f64::from_bits(1);
        for (terms, expected) in [
            (vec![max, max, -max, -max, tiny], 1),
            (vec![max, -max], 0),
            (vec![2_f64.powi(1020), -2_f64.powi(1020), -tiny], -1),
            (vec![1e308, 1e308, -max], 1),
            (vec![SAFE_MAGNITUDE, -SAFE_MAGNITUDE, -tiny], -1),
        ] {
            assert_eq!(exact_sign(&terms), expected);
            assert_eq!(oracle(&terms).0, expected);
        }
        let mut repeated = vec![max; 4096];
        repeated.extend(vec![-max; 4096]);
        assert_eq!(exact_sign(&repeated), 0);
        repeated.push(-tiny);
        assert_eq!(exact_sign(&repeated), -1);
    }

    #[test]
    fn expansion_sign_rounding_and_exact_value_match_independent_binary_oracle() {
        let mut seed = 0x5eed_1234_fade_cafe;
        for case in 0..10_000 {
            let count = 1 + (next(&mut seed) % 8) as usize;
            let mut terms: Vec<f64> = Vec::new();
            for index in 0..count {
                let bits = next(&mut seed);
                let exponent = next(&mut seed) % 2023;
                let value = f64::from_bits((bits & 0x800f_ffff_ffff_ffff) | (exponent << 52));
                terms.push(if index > 0 && case % 3 == 0 {
                    -terms[0]
                } else {
                    value
                });
            }
            if case % 5 == 0 {
                terms.extend([0.1, 0.2, -0.3]);
            }
            let partials = exact_sum(&terms);
            let (expected_sign, expected_rounding) = oracle(&terms);
            assert_eq!(sign_of(&partials), expected_sign, "case {case}");
            assert_eq!(exact_sign(&terms), expected_sign, "case {case}");
            assert_eq!(integer_sign(&terms), expected_sign, "case {case}");
            assert_eq!(
                rounded_value(&partials).to_bits(),
                expected_rounding.to_bits(),
                "case {case}: {terms:?}"
            );
            for (index, partial) in partials.iter().enumerate() {
                assert_ne!(*partial, 0.0);
                if index > 0 {
                    assert!(partial.abs() > partials[index - 1].abs());
                }
            }
            let mut residual = terms;
            residual.extend(negated(&partials));
            assert_eq!(oracle(&residual).0, 0, "exact value in case {case}");
        }
    }

    #[test]
    fn integer_fallback_matches_oracle_across_every_binary_exponent() {
        let mut seed = 0x1234_5eed_face_feed;
        for exponent in 0..2047_u64 {
            let raw = next(&mut seed) & 0x000f_ffff_ffff_ffff;
            let a = f64::from_bits((exponent << 52) | raw);
            let b = f64::from_bits((next(&mut seed) & 0x800f_ffff_ffff_ffff) | (exponent << 52));
            for terms in [vec![a, b], vec![a, b, -a], vec![a, -a, f64::from_bits(1)]] {
                assert_eq!(
                    integer_sign(&terms),
                    oracle(&terms).0,
                    "exponent {exponent}"
                );
                assert_eq!(exact_sign(&terms), oracle(&terms).0, "exponent {exponent}");
            }
        }
    }
}
