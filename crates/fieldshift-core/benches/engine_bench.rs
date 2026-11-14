use fieldshift_core::optimize::{optimize, pick_three};
use fieldshift_core::rotation::simulate_rotation;
use fieldshift_core::season::simulate_season;
use fieldshift_core::{
    builtin_demo_farm, PriorityWeights, RotationConstraints, RotationStep, SimOptions,
};
use std::time::Instant;

fn main() {
    let farm = builtin_demo_farm("iowa");
    let opts = SimOptions::default();
    let rot = vec![
        RotationStep {
            crop: "maize".to_string(),
            cover: false,
        },
        RotationStep {
            crop: "soybean".to_string(),
            cover: true,
        },
    ];

    // 1. Benchmark simulate_season (target < 0.2 ms native)
    let n_season = 2_000;
    let t0 = Instant::now();
    for _ in 0..n_season {
        let _ = std::hint::black_box(simulate_season(&farm, "maize", 2012, &opts, false));
    }
    let season_us = t0.elapsed().as_secs_f64() * 1e6 / (n_season as f64);

    // 2. Benchmark simulate_rotation 24 years x 2 phases (target < 2.0 ms native)
    let n_rot = 500;
    let t1 = Instant::now();
    for _ in 0..n_rot {
        let _ = std::hint::black_box(simulate_rotation(&farm, &rot, &opts, None));
    }
    let rot_ms = t1.elapsed().as_secs_f64() * 1e3 / (n_rot as f64);

    // 3. Benchmark optimize + pick_three
    let weights = PriorityWeights::default();
    let constraints = RotationConstraints::default();
    let t2 = Instant::now();
    let ranked = optimize(&farm, &[], &opts, &weights, &rot, &constraints);
    let _picks = pick_three(&ranked, &rot);
    let opt_ms = t2.elapsed().as_secs_f64() * 1e3;

    println!(
        "FieldShift Engine Benchmark:\n  simulate_season:   {:.3} ms ({:.1} µs)\n  simulate_rotation: {:.3} ms (24 yrs × 2 phases)\n  optimize ({} cands): {:.1} ms",
        season_us / 1000.0,
        season_us,
        rot_ms,
        ranked.len(),
        opt_ms
    );
}
