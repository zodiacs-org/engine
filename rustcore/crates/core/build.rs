use std::{env, path::PathBuf, process::Command};

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../..");
    for path in [
        root.join("scripts/generate-time-data.mjs"),
        root.join("scripts/generate-planet-data.mjs"),
        root.join("scripts/generate-moon-data.mjs"),
        root.join("../src/deltat.ts"),
        root.join("../src/time-scale-data.ts"),
        root.join("node_modules/astronomy-engine/esm/astronomy.js"),
        root.join("node_modules/astronomy-engine/package.json"),
        root.join("package.json"),
        root.join("package-lock.json"),
        root.join("../package.json"),
        root.join("../package-lock.json"),
    ] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    for generator in [
        "generate-time-data.mjs",
        "generate-planet-data.mjs",
        "generate-moon-data.mjs",
    ] {
        let status = Command::new("node")
            .arg(root.join("scripts").join(generator))
            .arg("--rust")
            .arg(env::var_os("OUT_DIR").unwrap())
            .status()
            .expect("Node must be on PATH to generate the checked local numeric tables");
        assert!(status.success(), "Data generation failed: {generator}");
    }
}
