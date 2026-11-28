//! Mean and true frame rotations translated from `src/equator.ts`.
//!
//! Matrices act on column vectors and use the same scalar operation order as
//! the TypeScript engine. The true equator is R1(-obliquity) R3(-dpsi) M,
//! where M takes EQJ to the mean ecliptic of date.

use crate::frame::ecliptic_frame;

const DEG: f64 = std::f64::consts::PI / 180.0;
const ARCSEC: f64 = DEG / 3600.0;

/// A rotation matrix stored row by row.
pub type Rows = [f64; 9];

/// The mean or true equinox and, for equatorial frames, equator of date.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameKind {
    Mean,
    True,
}

fn to_equator(m: &Rows, angle: f64) -> Rows {
    let c = angle.cos();
    let s = angle.sin();
    [
        m[0],
        m[1],
        m[2],
        c * m[3] - s * m[6],
        c * m[4] - s * m[7],
        c * m[5] - s * m[8],
        s * m[3] + c * m[6],
        s * m[4] + c * m[7],
        s * m[5] + c * m[8],
    ]
}

fn to_true_equinox(m: &Rows, dpsi: f64) -> Rows {
    let c = dpsi.cos();
    let s = dpsi.sin();
    [
        c * m[0] - s * m[3],
        c * m[1] - s * m[4],
        c * m[2] - s * m[5],
        s * m[0] + c * m[3],
        s * m[1] + c * m[4],
        s * m[2] + c * m[5],
        m[6],
        m[7],
        m[8],
    ]
}

/// EQJ to the ecliptic/equinox of date at `tt`, days of TT from J2000.0.
pub fn ecliptic_rows(tt: f64, kind: FrameKind) -> Rows {
    let frame = ecliptic_frame(tt);
    match kind {
        FrameKind::Mean => frame.rows,
        FrameKind::True => to_true_equinox(&frame.rows, frame.tilt.dpsi * ARCSEC),
    }
}

/// EQJ to the equator/equinox of date at `tt`, days of TT from J2000.0.
pub fn equator_rows(tt: f64, kind: FrameKind) -> Rows {
    let frame = ecliptic_frame(tt);
    match kind {
        FrameKind::Mean => to_equator(&frame.rows, frame.tilt.mobl * DEG),
        FrameKind::True => to_equator(
            &to_true_equinox(&frame.rows, frame.tilt.dpsi * ARCSEC),
            frame.tilt.tobl * DEG,
        ),
    }
}

/// Rotate a vector in the operation order of astronomy-engine's RotateVector.
pub fn turn(m: &Rows, x: f64, y: f64, z: f64) -> [f64; 3] {
    [
        m[0] * x + m[1] * y + m[2] * z,
        m[3] * x + m[4] * y + m[5] * z,
        m[6] * x + m[7] * y + m[8] * z,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    const IDENTITY: Rows = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

    #[test]
    fn mean_equator_at_j2000_is_identity_and_true_equator_moves_it() {
        let mean = equator_rows(0.0, FrameKind::Mean);
        for index in 0..9 {
            assert!((mean[index] - IDENTITY[index]).abs() <= 3e-16);
        }
        let true_rows = equator_rows(0.0, FrameKind::True);
        assert!(true_rows[1].abs() > 1e-6);
        assert!(true_rows[5].abs() > 1e-6);
    }

    #[test]
    fn equinox_rotation_preserves_ecliptic_pole_and_changes_first_two_rows() {
        for tt in [-73048.5, -12345.678, 0.0, 45678.9, 73048.5] {
            let mean = ecliptic_rows(tt, FrameKind::Mean);
            let true_rows = ecliptic_rows(tt, FrameKind::True);
            for index in 6..9 {
                assert_eq!(mean[index].to_bits(), true_rows[index].to_bits());
            }
            assert_ne!(mean[0..6], true_rows[0..6]);
        }
    }

    #[test]
    fn true_equator_rotates_equinox_before_obliquity() {
        let frame = ecliptic_frame(45678.9);
        let ordered = to_equator(
            &to_true_equinox(&frame.rows, frame.tilt.dpsi * ARCSEC),
            frame.tilt.tobl * DEG,
        );
        assert_eq!(equator_rows(frame.tt, FrameKind::True), ordered);
        let reversed = to_true_equinox(
            &to_equator(&frame.rows, frame.tilt.tobl * DEG),
            frame.tilt.dpsi * ARCSEC,
        );
        assert!(ordered
            .iter()
            .zip(reversed)
            .any(|(a, b)| (a - b).abs() > 1e-7));
    }

    #[test]
    fn every_frame_rotates_back_through_its_transpose() {
        let vector = [-0.25, 1.75, 0.5];
        for tt in [-73048.5, -36524.5, 0.0, 36525.0, 73048.5] {
            for kind in [FrameKind::Mean, FrameKind::True] {
                for rows in [ecliptic_rows(tt, kind), equator_rows(tt, kind)] {
                    let transpose = [
                        rows[0], rows[3], rows[6], rows[1], rows[4], rows[7], rows[2], rows[5],
                        rows[8],
                    ];
                    let projected = turn(&rows, vector[0], vector[1], vector[2]);
                    let restored = turn(&transpose, projected[0], projected[1], projected[2]);
                    for axis in 0..3 {
                        assert!((restored[axis] - vector[axis]).abs() <= 3e-15);
                    }
                }
            }
        }
    }

    #[test]
    fn turn_preserves_the_reference_addition_order() {
        let rows = [1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        assert_eq!(turn(&rows, 1e16, -1e16, 1.0), [1.0, -1e16, 1.0]);
    }
}
