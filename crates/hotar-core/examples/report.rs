//! Prints headline numbers of the simulator and quant engine on the mock packs (used for PR validation tables).
//! `cargo run --release -p hotar-core --example report`

use hotar_core::quant::{quant_simulate, QuantConfig};
use hotar_core::rotation::simulate_rotation;
use hotar_core::stress::adaptation_margin;
use hotar_core::*;
use std::time::Instant;

fn load(id: &str) -> PreparedFarm {
    let p = format!(
        "{}/../../apps/web/public/data/mock/farms/{id}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    prepare_farm_json(&std::fs::read_to_string(p).expect("pack")).expect("prepare")
}

fn rot(c: &[&str]) -> Vec<RotationStep> {
    c.iter().map(|s| RotationStep::new(*s, false)).collect()
}

fn main() {
    let o = SimOptions::default();
    for (farm, rotations) in [
        (
            "iowa",
            vec![vec!["maize", "soybean"], vec!["wheat", "sorghum"]],
        ),
        (
            "baragan",
            vec![vec!["maize", "wheat"], vec!["wheat", "sunflower"]],
        ),
        (
            "kansas",
            vec![vec!["wheat", "sorghum"], vec!["maize", "soybean"]],
        ),
    ] {
        let f = load(farm);
        for r in rotations {
            let rr = simulate_rotation(&f, &rot(&r), &o, None).unwrap();
            let ys: Vec<String> = rr
                .yield_by_crop
                .iter()
                .map(|(c, v)| format!("{c} {:.2}", v.iter().sum::<f64>() / v.len() as f64))
                .collect();
            let m = adaptation_margin(&f, &rot(&r), &o).unwrap();
            println!(
                "{farm:8} {:24} meanNet {:7.1} pFail {:.2} worst {} | {} | margin dT {:.2} dP {:.2} already {}",
                r.join("-"), rr.mean_net, rr.p_fail, rr.worst_year, ys.join(", "), m.d_t, m.d_p, m.already
            );
        }
    }
    let f = load("iowa");
    let rots: Vec<Vec<RotationStep>> = vec![
        rot(&["maize", "soybean"]),
        rot(&["wheat", "sorghum"]),
        rot(&["maize", "soybean", "wheat"]),
        rot(&["sunflower", "pea"]),
    ];
    let cfg = QuantConfig {
        paths: 10_000,
        ..Default::default()
    };
    let t = Instant::now();
    let q = quant_simulate(&f, &rots, &o, &cfg, None).unwrap();
    println!(
        "quant 10000 paths x 26 y x 4 rotations: {:.2?}",
        t.elapsed()
    );
    for r in &q {
        println!(
            "  {:?} mean {} sd {} var95 {} cvar95 {} pRuin {}",
            r.rotation
                .iter()
                .map(|s| s.crop.as_str())
                .collect::<Vec<_>>(),
            r.mean_annual,
            r.sd_annual,
            r.var95,
            r.cvar95,
            r.p_ruin
        );
    }
}
