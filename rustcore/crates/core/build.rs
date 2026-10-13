use std::{env, path::PathBuf, process::Command};

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../..");
    let generator = root.join("scripts/generate-time-data.mjs");
    for path in [
        generator.clone(),
        root.join("../src/deltat.ts"),
        root.join("../src/time-scale-data.ts"),
    ] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    let status = Command::new("node")
        .arg(generator)
        .arg("--rust")
        .arg(env::var_os("OUT_DIR").unwrap())
        .status()
        .expect("Node must be on PATH to generate the checked local time tables");
    assert!(status.success(), "Time data generation failed");
}
