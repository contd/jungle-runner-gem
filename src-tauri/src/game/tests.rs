//! Native world determinism, terrain-boundary, batching, validation and actual IPC tests.
//! Shared checked-in vectors exercise both languages across tier/biome transitions.

use super::*;
use serde_json::{json, Value};

/// Shared deterministic reference sequence spanning the staged introduction boundaries.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    /// Initial signed seed before frontend unsigned normalization.
    seed: i64,
    /// Ordered selection-time game meters.
    distances: Vec<f64>,
    /// Exact selected catalog IDs.
    ids: Vec<String>,
    /// Final unsigned accumulator.
    rng_state: u32,
}

/// Start an isolated stateless request with a normalized seed.
fn request(seed: u32, distances: Vec<f64>) -> WorldRequest {
    WorldRequest {
        state: WorldState {
            rng_state: seed,
            last_chunk_id: String::new(),
        },
        distances,
    }
}

/// Compare exact selected IDs and continuation, not only self-consistent replay.
#[test]
fn shared_browser_vectors_match_rust() {
    let fixtures: Vec<Fixture> =
        serde_json::from_str(include_str!("../../../tests/fixtures/world-parity.json")).unwrap();
    for fixture in fixtures {
        let batch = plan_world(request(fixture.seed as u32, fixture.distances)).unwrap();
        assert_eq!(
            batch.chunks.iter().map(|c| &c.chunk.id).collect::<Vec<_>>(),
            fixture.ids.iter().collect::<Vec<_>>()
        );
        assert_eq!(batch.state.rng_state, fixture.rng_state);
        assert_eq!(batch.state.last_chunk_id, *fixture.ids.last().unwrap());
    }
}

/// Boundaries and repeated biome cycles must match the original browser selector.
#[test]
fn difficulty_and_biome_boundaries_are_preserved() {
    for (distance, tier) in [
        (0.0, 1),
        (599.0, 1),
        (600.0, 2),
        (1199.0, 2),
        (1200.0, 3),
        (2199.0, 3),
        (2200.0, 4),
    ] {
        assert_eq!(difficulty(distance), tier);
    }
    for (distance, expected) in [
        (399.0, Biome::Canopy),
        (400.0, Biome::Swamp),
        (800.0, Biome::Temple),
        (1200.0, Biome::Cavern),
        (1600.0, Biome::Canopy),
    ] {
        assert_eq!(biome(distance), expected);
    }
}

/// All catalog recipes are audited, and surface planning preserves inclusive first-match gaps.
#[test]
fn terrain_and_catalog_spacing_are_preserved() {
    let catalog = catalog().unwrap();
    assert_eq!(catalog.len(), 13);
    for chunk in catalog {
        assert!(validate_solvability(chunk), "{}", chunk.id);
        let tiles = plan_terrain(chunk);
        assert_eq!(tiles.len(), 15);
        assert_eq!(tiles[0].x_offset, 32.0);
        assert_eq!(tiles[14].x_offset, 928.0);
    }
    let mut chunk = catalog[0].clone();
    let mut gap = catalog[3].obstacles[0].clone();
    gap.x_offset = 96.0;
    gap.width = Some(128.0);
    let mut overlapping = gap.clone();
    overlapping.r#type = ObstacleType::WaterLagoon;
    chunk.obstacles = vec![gap, overlapping];
    let tiles = plan_terrain(&chunk);
    assert_eq!(tiles[0].r#type, Surface::Pit);
    assert_eq!(tiles[1].r#type, Surface::Pit);
    assert_eq!(tiles[2].r#type, Surface::Pit);
    assert_eq!(tiles[3].r#type, Surface::Ground);
    chunk.obstacles[0].x_offset = 100.0;
    chunk.obstacles[1].x_offset = 110.0;
    assert!(!validate_solvability(&chunk));
}

/// One batch and successive singleton requests consume exactly the same random stream.
#[test]
fn batching_and_zero_continuations_are_exact() {
    for seed in [0, 1, u32::MAX] {
        let distances = vec![50.0, 300.0, 800.0, 1500.0];
        let expected = plan_world(request(seed, distances.clone())).unwrap();
        let mut state = request(seed, vec![]).state;
        let mut chunks = Vec::new();
        for distance in distances {
            let batch = plan_world(WorldRequest {
                state,
                distances: vec![distance],
            })
            .unwrap();
            state = batch.state;
            chunks.extend(batch.chunks);
        }
        assert_eq!(state, expected.state);
        assert_eq!(
            serde_json::to_value(chunks).unwrap(),
            serde_json::to_value(expected.chunks).unwrap()
        );
    }
}

/// Invalid envelopes and unreasonable batch sizes cannot reach the selection loop.
#[test]
fn invalid_requests_are_rejected() {
    for distances in [
        vec![],
        vec![0.0; 65],
        vec![-1.0],
        vec![f64::NAN],
        vec![f64::INFINITY],
        vec![MAX_DISTANCE + 1.0],
    ] {
        assert!(plan_world(request(1, distances)).is_err());
    }

    assert_eq!(
        plan_world(request(1, vec![0.0; 64])).unwrap().chunks.len(),
        64
    );
    let mut invalid = request(1, vec![0.0]);
    invalid.state.last_chunk_id = "not_a_chunk".into();
    assert!(plan_world(invalid).is_err());
}

/// Oversized voids are narrowed even if vines are nearby.
#[test]
fn unsupported_gaps_are_narrowed_to_single_jump_reach() {
    let mut chunk = catalog().unwrap()[0].clone();
    let mut pit = catalog().unwrap()[3].obstacles[0].clone();
    pit.x_offset = 480.0;
    pit.width = Some(440.0);
    chunk.obstacles = vec![pit];
    assert!(!validate_jump_gaps(&chunk));
    let mut supported = chunk.clone();
    let mut vine = catalog().unwrap()[4].obstacles[1].clone();
    vine.x_offset = 480.0;
    supported.obstacles.push(vine);
    normalize_gaps(&mut supported).unwrap();
    assert!(validate_jump_gaps(&supported));
    assert!(supported.obstacles[0].width.unwrap() < 440.0);
    normalize_gaps(&mut chunk).unwrap();
    assert!(validate_jump_gaps(&chunk));
    assert_eq!(jump_limit(), 64.0);
    assert!(
        plan_terrain(&chunk)
            .iter()
            .filter(|t| t.r#type == Surface::Pit)
            .count()
            * 64
            <= 64
    );
    for chunk in catalog().unwrap() {
        assert!(validate_jump_gaps(chunk), "{}", chunk.id);
        let tiles = plan_terrain(chunk);
        assert_eq!(tiles.first().unwrap().r#type, Surface::Ground);
        assert_eq!(tiles.last().unwrap().r#type, Surface::Ground);
    }
}

/// Crocodiles cannot exempt oversized spans from the conservative cap.
#[test]
fn crocodile_helpers_do_not_exempt_oversized_gaps() {
    let mut chunk = catalog().unwrap()[5].clone();
    let mut water = chunk.obstacles[0].clone();
    water.x_offset = 480.0;
    water.width = Some(256.0);
    let mut first = chunk.obstacles[1].clone();
    first.x_offset = 900.0;
    chunk.obstacles = vec![water, first];
    assert!(!validate_jump_gaps(&chunk));
    chunk.obstacles[1].x_offset = 500.0;
    assert!(!validate_jump_gaps(&chunk));
    chunk.obstacles[1].x_offset = 448.0;
    let mut second = chunk.obstacles[1].clone();
    second.x_offset = 560.0;
    chunk.obstacles.push(second);
    assert!(!validate_jump_gaps(&chunk));
    normalize_gaps(&mut chunk).unwrap();
    assert!(validate_jump_gaps(&chunk));
}

/// Many seeds retain the safe/log-only opening; all generated voids remain at most one tile.
#[test]
fn staged_opening_and_every_catalog_gap_are_safe() {
    for seed in 1..=100 {
        let batch = plan_world(request(
            seed,
            vec![0.0, 40.0, 99.0, 100.0, 200.0, 299.0, 300.0, 599.0],
        ))
        .unwrap();
        assert!(batch.chunks[..3]
            .iter()
            .all(|c| c.chunk.obstacles.is_empty()));
        assert!(batch.chunks[..6].iter().all(|c| c
            .chunk
            .obstacles
            .iter()
            .all(|o| o.r#type == ObstacleType::Log)));
        assert!(batch.chunks[6..].iter().all(|c| c.chunk.min_tier == 1));
    }
    for chunk in catalog().unwrap() {
        let mut gap = 0;
        for tile in plan_terrain(chunk) {
            if matches!(tile.r#type, Surface::Pit | Surface::WaterLagoon) {
                gap += 64;
            } else {
                gap = 0;
            }
            assert!(gap <= 64, "{}", chunk.id);
        }
    }
}
/// Replaying an abandoned request is deterministic and has no global mutable session.
#[test]
fn concurrent_replay_does_not_share_state() {
    let first = std::thread::spawn(|| plan_world(request(1337, vec![0.0; 32])).unwrap());
    let second = plan_world(request(1337, vec![0.0; 32])).unwrap();
    assert_eq!(
        serde_json::to_value(first.join().unwrap()).unwrap(),
        serde_json::to_value(second).unwrap()
    );
}

/// Exercise the registered async command's serialization and rejected serde inputs.
#[test]
fn actual_tauri_world_command_returns_plans_and_errors() {
    let app = tauri::test::mock_builder()
        .invoke_handler(tauri::generate_handler![native_world])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    // Derive the local origin from Tauri rather than assuming the Unix protocol.
    let local_url = webview.url().unwrap();
    let invoke_from = |request: Value, url: &str| {
        tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "native_world".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: url.parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(json!({"request": request})),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    };
    let invoke = |request| invoke_from(request, local_url.as_str());
    assert!(
        invoke_from(
            json!({"state":{"rngState":1337,"lastChunkId":""},"distances":[0]}),
            "https://untrusted.example.invalid"
        )
        .is_err(),
        "Remote origins must not gain native world access"
    );
    let result =
        invoke(json!({"state":{"rngState":1337,"lastChunkId":""},"distances":[0,300]})).unwrap();
    assert_eq!(result["chunks"].as_array().unwrap().len(), 2);
    assert_eq!(result["chunks"][0]["id"], "warmup_stroll");
    assert_eq!(result["chunks"][0]["tiles"].as_array().unwrap().len(), 15);
    assert!(invoke(json!({"state":{"rngState":-1,"lastChunkId":""},"distances":[0]})).is_err());
    assert!(invoke(json!({"state":{"rngState":1,"lastChunkId":""},"distances":[-1]})).is_err());
}
