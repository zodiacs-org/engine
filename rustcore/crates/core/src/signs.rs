//! Sign annotations translated from the MIT `src/signs.ts`.

use crate::{normalize_longitude, LongitudeError};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SignDefinition {
    pub slug: &'static str,
    pub name: &'static str,
    pub element: &'static str,
    pub modality: &'static str,
    pub polarity: &'static str,
    pub natural_house: u8,
}

pub const ELEMENTS: [&str; 4] = ["fire", "earth", "air", "water"];
pub const MODALITIES: [&str; 3] = ["cardinal", "fixed", "mutable"];

const fn sign(index: usize, slug: &'static str, name: &'static str) -> SignDefinition {
    SignDefinition {
        slug,
        name,
        element: ELEMENTS[index % 4],
        modality: MODALITIES[index % 3],
        polarity: if index % 2 == 0 { "day" } else { "night" },
        natural_house: (index + 1) as u8,
    }
}

pub static SIGNS: [SignDefinition; 12] = [
    sign(0, "aries", "Aries"),
    sign(1, "taurus", "Taurus"),
    sign(2, "gemini", "Gemini"),
    sign(3, "cancer", "Cancer"),
    sign(4, "leo", "Leo"),
    sign(5, "virgo", "Virgo"),
    sign(6, "libra", "Libra"),
    sign(7, "scorpio", "Scorpio"),
    sign(8, "sagittarius", "Sagittarius"),
    sign(9, "capricorn", "Capricorn"),
    sign(10, "aquarius", "Aquarius"),
    sign(11, "pisces", "Pisces"),
];

pub fn sign_index_for_longitude(longitude: f64) -> Result<usize, LongitudeError> {
    Ok((normalize_longitude(longitude)? / 30.0).floor() as usize)
}

pub fn sign_for_longitude(longitude: f64) -> Result<&'static SignDefinition, LongitudeError> {
    Ok(&SIGNS[sign_index_for_longitude(longitude)?])
}

/// Degrees into the normalized sign, preserving the reference's remainders.
pub fn degree_in_sign(longitude: f64) -> Result<f64, LongitudeError> {
    Ok(normalize_longitude(longitude)? % 30.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_boundaries_and_annotations_follow_zodiac_order() {
        for (index, definition) in SIGNS.iter().enumerate() {
            let longitude = (index * 30) as f64;
            assert_eq!(sign_index_for_longitude(longitude), Ok(index));
            assert_eq!(degree_in_sign(longitude), Ok(0.0));
            assert_eq!(degree_in_sign(longitude + 29.5), Ok(29.5));
            assert!(std::ptr::eq(
                sign_for_longitude(longitude).unwrap(),
                definition
            ));
            assert_eq!(definition.natural_house as usize, index + 1);
        }
        assert_eq!(sign_for_longitude(-0.5).unwrap().slug, "pisces");
        assert_eq!(sign_for_longitude(360.0).unwrap().slug, "aries");
        assert_eq!(sign_for_longitude(90.0).unwrap().element, "water");
    }

    #[test]
    fn keeps_normalization_rounding_and_validation() {
        let below_turn = f64::from_bits(360.0_f64.to_bits() - 1);
        for longitude in [-0.0, -f64::from_bits(1), below_turn] {
            assert_eq!(sign_index_for_longitude(longitude), Ok(0));
            assert_eq!(
                degree_in_sign(longitude).unwrap().to_bits(),
                0.0_f64.to_bits()
            );
        }
        for longitude in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(sign_for_longitude(longitude), Err(LongitudeError));
            assert_eq!(degree_in_sign(longitude), Err(LongitudeError));
        }
    }
}
