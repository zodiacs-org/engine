//! Deterministic native workloads shared with the Node benchmark harness.
//!
//! Every measured iteration is a complete corpus sweep. Setup, date parsing,
//! policy construction and house angles are outside the timed regions.

#![forbid(unsafe_code)]

use criterion::{criterion_group, Criterion, Throughput};
use std::hint::black_box;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use zodiacs_rustcore::{
    aspects::{
        self, AspectOrbInput, AspectPolicy, AspectPolicyInput, AspectPosition, AspectRuleInput,
        CONFIGURED_ASPECT_ANGLES,
    },
    date_input, ephemeris, frame,
    houses::{self, AngleInput, Angles, HOUSE_SYSTEMS},
    time_scales::{self, TimeScaleName},
};

const YEARS: [i32; 9] = [1800, 1850, 1900, 1950, 2000, 2050, 2100, 2150, 2200];
const LATITUDES: [f64; 7] = [-80.0, -66.5, -45.0, 0.0, 45.0, 66.5, 80.0];
const ALL_ANGLES: [f64; 11] = [
    0.0, 60.0, 90.0, 120.0, 180.0, 30.0, 45.0, 72.0, 135.0, 144.0, 150.0,
];

fn epochs() -> [f64; 9] {
    YEARS.map(|year| {
        date_input::date_from_iso(&format!("{year}-01-01T00:00:00Z"))
            .expect("synthetic benchmark date")
    })
}

fn positions_sweep(dates: &[f64; 9]) {
    for &ms in dates {
        black_box(ephemeris::positions(black_box(ms)).expect("benchmark positions"));
    }
}

fn positions(c: &mut Criterion) {
    let dates = epochs();
    let mut group = c.benchmark_group("positions");
    group.throughput(Throughput::Elements(dates.len() as u64));

    // Integration segments survive on this thread between sweeps. Populate
    // every segment touched by this exact corpus before the warm benchmark.
    positions_sweep(&dates);
    group.bench_function("warm", |b| b.iter(|| positions_sweep(black_box(&dates))));

    // Pluto owns its cache in thread-local storage. Each worker therefore
    // starts with no segments, without adding a benchmark-only library API.
    // Time only the sweep inside the worker, excluding thread creation, join
    // and cache teardown. This is first-use computation, not process startup.
    group.bench_function("cold", |b| {
        b.iter_custom(|iterations| {
            let mut measured = Duration::ZERO;
            for _ in 0..iterations {
                measured += std::thread::spawn(move || {
                    let start = Instant::now();
                    positions_sweep(black_box(&dates));
                    start.elapsed()
                })
                .join()
                .expect("cold positions worker");
            }
            measured
        });
    });
    group.finish();
}

fn house_inputs() -> Vec<(AngleInput, Angles)> {
    (0..YEARS.len())
        .flat_map(|i| {
            LATITUDES.map(|latitude| {
                let input = AngleInput {
                    gast_hours: i as f64 * 2.75,
                    latitude,
                    longitude: i as f64 * 37.0 - 148.0,
                    obliquity: 23.4393,
                };
                let angles = houses::compute_angles(&input).expect("benchmark angles");
                (input, angles)
            })
        })
        .collect()
}

fn houses(c: &mut Criterion) {
    let inputs = house_inputs();
    let mut group = c.benchmark_group("houses");
    group.throughput(Throughput::Elements(inputs.len() as u64));
    for system in HOUSE_SYSTEMS {
        group.bench_function(system.name(), |b| {
            b.iter(|| {
                for (input, angles) in black_box(&inputs) {
                    black_box(
                        houses::compute_houses(black_box(system), input, angles)
                            .expect("benchmark house geometry"),
                    );
                }
            });
        });
    }
    group.finish();
}

fn aspect_charts() -> Vec<Vec<AspectPosition>> {
    (0..YEARS.len())
        .map(|chart| {
            ephemeris::BODIES
                .into_iter()
                .enumerate()
                .map(|(body, name)| AspectPosition {
                    body: name.name().into(),
                    lon: (body as f64 * 31.25 + chart as f64 * (body + 1) as f64 / 8.0) % 360.0,
                    speed: (body as f64 % 5.0 - 2.0) / 4.0 + chart as f64 / 1024.0,
                })
                .collect()
        })
        .collect()
}

fn aspect_policies() -> [(&'static str, AspectPolicy); 3] {
    let default = aspects::create_aspect_policy(AspectPolicyInput::default())
        .expect("default benchmark policy");
    let all = aspects::create_aspect_policy(AspectPolicyInput {
        aspects: Some(
            ALL_ANGLES
                .iter()
                .map(|&angle| {
                    let name = CONFIGURED_ASPECT_ANGLES
                        .iter()
                        .find(|&&(_, named_angle)| named_angle == angle)
                        .expect("named benchmark aspect")
                        .0;
                    AspectRuleInput {
                        aspect_type: name.into(),
                        angle: None,
                        orb: AspectOrbInput::Uniform(2.0),
                        luminary_orb: None,
                    }
                })
                .collect(),
        ),
        ..Default::default()
    })
    .expect("all-named benchmark policy");
    let custom = aspects::create_aspect_policy(AspectPolicyInput {
        aspects: Some(vec![
            AspectRuleInput {
                aspect_type: "custom".into(),
                angle: Some(17.25),
                orb: AspectOrbInput::Uniform(1.5),
                luminary_orb: None,
            },
            AspectRuleInput {
                aspect_type: "square".into(),
                angle: None,
                orb: AspectOrbInput::Uniform(3.0),
                luminary_orb: None,
            },
        ]),
        bodies: Some(
            ephemeris::BODIES
                .iter()
                .map(|body| body.name().into())
                .collect(),
        ),
        ..Default::default()
    })
    .expect("custom benchmark policy");

    [
        ("configured_default", default),
        ("configured_all", all),
        ("configured_custom", custom),
    ]
}

fn aspects(c: &mut Criterion) {
    let charts = aspect_charts();
    let policies = aspect_policies();
    let mut group = c.benchmark_group("aspects");
    group.throughput(Throughput::Elements(charts.len() as u64));
    group.bench_function("legacy", |b| {
        b.iter(|| {
            for chart in black_box(&charts) {
                black_box(aspects::find_aspects(chart));
            }
        });
    });
    for (name, policy) in policies {
        group.bench_function(name, |b| {
            b.iter(|| {
                for chart in black_box(&charts) {
                    black_box(
                        aspects::find_configured_aspects(chart, black_box(&policy))
                            .expect("benchmark aspect chart"),
                    );
                }
            });
        });
    }
    group.finish();
}

fn time_and_frame(c: &mut Criterion) {
    let dates = epochs();
    let mut group = c.benchmark_group("time");
    group.throughput(Throughput::Elements(dates.len() as u64));
    group.bench_function("utc", |b| {
        b.iter(|| {
            for &ms in black_box(&dates) {
                black_box(
                    time_scales::time_basis(ms, TimeScaleName::Utc, None)
                        .expect("benchmark time basis"),
                );
            }
        });
    });
    group.finish();

    let frames = dates.map(|ms| {
        time_scales::time_basis(ms, TimeScaleName::Utc, None)
            .expect("benchmark frame basis")
            .tt_days
    });
    let mut group = c.benchmark_group("frame");
    group.throughput(Throughput::Elements(frames.len() as u64));
    group.bench_function("ecliptic_of_date", |b| {
        b.iter(|| {
            for (i, &tt) in black_box(&frames).iter().enumerate() {
                black_box(
                    frame::ecliptic_of_date(1.0 + i as f64 / 16.0, -0.5, 0.25, tt)
                        .expect("benchmark ecliptic frame"),
                );
            }
        });
    });
    group.finish();
}

fn configuration() -> Criterion {
    let output = std::env::var_os("RUSTCORE_BENCH_OUTPUT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../generated/benchmark-native/criterion")
        });
    Criterion::default()
        .sample_size(30)
        .warm_up_time(Duration::from_secs(1))
        .measurement_time(Duration::from_secs(2))
        .without_plots()
        .output_directory(&output)
}

criterion_group! {
    name = benches;
    config = configuration();
    targets = positions, houses, aspects, time_and_frame
}

fn describe() {
    let mut workloads = vec![
        ("positions/warm".to_owned(), 9),
        ("positions/cold".into(), 9),
    ];
    workloads.extend(HOUSE_SYSTEMS.map(|system| {
        (
            format!("houses/{}", system.name()),
            YEARS.len() * LATITUDES.len(),
        )
    }));
    workloads.extend(
        [
            "aspects/legacy",
            "aspects/configured_default",
            "aspects/configured_all",
            "aspects/configured_custom",
            "time/utc",
            "frame/ecliptic_of_date",
        ]
        .map(|id| (id.to_owned(), YEARS.len())),
    );
    let workloads = workloads
        .into_iter()
        .map(|(id, calls)| format!(r#"{{"id":{id:?},"callsPerIteration":{calls}}}"#))
        .collect::<Vec<_>>()
        .join(",");
    let longitudes = (0..YEARS.len())
        .map(|i| i as f64 * 37.0 - 148.0)
        .collect::<Vec<_>>();
    let charts = aspect_charts()
        .into_iter()
        .map(|chart| {
            let rows = chart
                .into_iter()
                .map(|row| {
                    format!(
                        r#"{{"body":{:?},"lon":{:?},"speed":{:?}}}"#,
                        row.body, row.lon, row.speed
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            format!("[{rows}]")
        })
        .collect::<Vec<_>>()
        .join(",");
    let policies = aspect_policies()
        .into_iter()
        .map(|(id, policy)| {
            let rules = policy
                .aspects()
                .iter()
                .map(|rule| {
                    let luminary = rule.luminary_orb.map_or_else(
                        || "null".into(),
                        |orb| {
                            format!(
                                r#"{{"applying":{:?},"separating":{:?},"stationary":{:?}}}"#,
                                orb.applying, orb.separating, orb.stationary
                            )
                        },
                    );
                    format!(
                        r#"{{"type":{:?},"angle":{:?},"orb":{{"applying":{:?},"separating":{:?},"stationary":{:?}}},"luminaryOrb":{luminary}}}"#,
                        rule.aspect_type, rule.angle, rule.orb.applying,
                        rule.orb.separating, rule.orb.stationary
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            format!(
                r#"{{"id":{id:?},"bodies":{:?},"aspects":[{rules}]}}"#,
                policy.bodies()
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let house_inputs = house_inputs()
        .iter()
        .map(|(input, _)| {
            format!(
                r#"{{"gastHours":{:?},"latitude":{:?},"longitude":{:?},"obliquity":{:?}}}"#,
                input.gast_hours, input.latitude, input.longitude, input.obliquity
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    // All strings above are fixed ASCII benchmark identifiers and body names,
    // and every number is finite, so Debug formatting forms valid JSON here.
    println!(
        r#"{{"schema":1,"manifest":[{workloads}],"dates":{:?},"latitudes":{LATITUDES:?},"longitudes":{longitudes:?},"charts":[{charts}],"allAngles":{ALL_ANGLES:?},"houseInputs":[{house_inputs}],"policies":[{policies}]}}"#,
        epochs()
    );
}

fn main() {
    if std::env::args().skip(1).eq(["--describe"]) {
        describe();
        return;
    }
    benches();
    configuration().configure_from_args().final_summary();
}
