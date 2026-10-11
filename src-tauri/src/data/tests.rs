//! Native profile migration, progression, persistence, and failure-regression tests.
//!
//! Each file-backed test owns an isolated temporary directory and removes only
//! that directory on completion. No real application profiles are touched.

use super::*;
use serde_json::json;
use std::thread;

/// Isolated test directory with explicit cleanup on scope exit.
struct TestDirectory(PathBuf);

impl TestDirectory {
    /// Create a unique test path using process/sequence identity.
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "jungle-run-data-test-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    /// Construct a repository under this test-owned directory.
    fn repository(&self) -> NativeRepository {
        NativeRepository::new(self.0.join("profile.json"))
    }
}

impl Drop for TestDirectory {
    /// Remove the exact test-owned directory, never the application-data root.
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

/// Representative run matching the browser progression test values.
fn run() -> RunInput {
    RunInput {
        score: 1200.0,
        distance_meters: 450.0,
        coins_collected: 35.0,
        relics_collected: 2.0,
        hazards_avoided: 6.0,
        vines_swung: 4.0,
        cause_of_death: "crocodile".into(),
        character_id: "harry".into(),
        seed: 1337,
        mode: GameMode::Endless,
    }
}

/// Initialize an empty native save through the same operation used by IPC.
fn initialize(repository: &mut NativeRepository) {
    repository
        .execute(DataRequest::InitializeProfile {
            legacy_profile: None,
        })
        .unwrap();
}

/// Verify default catalog shape and complete independent profile copies.
#[test]
fn defaults_match_frontend_contract() {
    let profile = default_profile().unwrap();
    assert_eq!(profile.schema_version, 1);
    assert_eq!(profile.achievements.len(), 11);
    assert_eq!(profile.unlocked_skins.len(), 3);
    assert!(profile.unlocked_skins[0].unlocked);
    assert!(!profile.unlocked_skins[1].unlocked);
    let json = serde_json::to_value(profile).unwrap();
    assert_eq!(json["settings"]["musicVolume"], 0.7);
    assert_eq!(
        json["settings"]["keyBindings"]["jump"],
        json!(["Space", "KeyW", "ArrowUp"])
    );
}

/// Check accumulation, strict best flags, goals, and flat run serialization.
#[test]
fn run_progression_matches_browser_rules() {
    let result = record_run(default_profile().unwrap(), run()).unwrap();
    assert!(result.new_high_score && result.new_longest_distance);
    assert_eq!(result.profile.stats.total_runs, 1.0);
    assert_eq!(result.profile.stats.total_distance_meters, 450.0);
    assert_eq!(result.profile.stats.total_coins, 35.0);
    assert_eq!(result.profile.stats.total_relics, 2.0);
    assert_eq!(result.profile.stats.most_vines_swung_in_single_run, 4.0);
    assert_eq!(
        result.unlocked_achievements,
        ["First Expedition", "Liana Leaper"]
    );
    let a = &result.profile.achievements;
    assert_eq!(
        a.iter()
            .find(|a| a.id == "crocodile_dodger")
            .unwrap()
            .progress,
        0.0
    );
    assert_eq!(
        a.iter()
            .find(|a| a.id == "boulder_survivor")
            .unwrap()
            .progress,
        1.0
    );
    let same = record_run(result.profile, run()).unwrap();
    assert!(!same.new_high_score && !same.new_longest_distance);
    assert_eq!(same.unlocked_skins, ["Explorer Maya"]);
    let encoded = serde_json::to_value(same.profile.recent_runs.first().unwrap()).unwrap();
    assert_eq!(encoded["coinsCollected"], 35.0);
    assert!(encoded.get("input").is_none());
}

/// Verify every goal threshold plus the distance skin unlock and one-time notifications.
#[test]
fn all_achievement_thresholds_and_unlocks_are_preserved() {
    let mut profile = default_profile().unwrap();
    let mut input = run();
    input.distance_meters = 1500.0;
    input.score = 5000.0;
    input.coins_collected = 100.0;
    input.relics_collected = 5.0;
    input.vines_swung = 15.0;
    input.cause_of_death = "pit".into();
    for _ in 0..10 {
        profile = record_run(profile, input.clone()).unwrap().profile;
    }
    assert!(profile
        .achievements
        .iter()
        .all(|a| a.unlocked && a.progress == a.max_progress));
    assert!(profile.unlocked_skins.iter().all(|s| s.unlocked));
    let result = record_run(profile, input).unwrap();
    assert!(result.unlocked_achievements.is_empty() && result.unlocked_skins.is_empty());
}

/// Practice/challenge retain the existing all-mode accounting and negative seed support.
#[test]
fn run_modes_fractional_metrics_and_negative_seeds_are_supported() {
    let mut input = run();
    input.mode = GameMode::Practice;
    input.distance_meters = 12.5;
    input.seed = -42;
    let profile = record_run(default_profile().unwrap(), input.clone())
        .unwrap()
        .profile;
    input.mode = GameMode::Challenge;
    let profile = record_run(profile, input).unwrap().profile;
    assert_eq!(profile.stats.total_runs, 2.0);
    assert_eq!(profile.stats.total_distance_meters, 25.0);
}

/// Retain newest-first IDs and the original 30-record recording limit.
#[test]
fn history_is_bounded_and_ids_are_unique() {
    let mut profile = default_profile().unwrap();
    for i in 0..40 {
        let mut input = run();
        input.seed = i;
        profile = record_run(profile, input).unwrap().profile;
    }
    assert_eq!(profile.recent_runs.len(), 30);
    assert_eq!(profile.recent_runs[0].input.seed, 39);
    assert_eq!(profile.recent_runs[29].input.seed, 10);
    let ids: std::collections::HashSet<_> = profile.recent_runs.iter().map(|r| &r.id).collect();
    assert_eq!(ids.len(), 30);
}

/// Recover missing fields while preserving progress and authoritative catalog metadata.
#[test]
fn legacy_migration_fills_fields_and_merges_known_catalogs() {
    let profile = normalize_profile(json!({
        "stats": {"highScore": 8500},
        "settings": {"musicVolume": 0.2},
        "achievements": [
            {"id": "first_steps", "title": "stale", "progress": 70, "unlocked": false},
            {"id": "unknown", "unlocked": true}
        ],
        "unlockedSkins": [{"id": "harry", "unlocked": false}, {"id": "maya", "unlocked": true}]
    }))
    .unwrap();
    assert_eq!(profile.stats.high_score, 8500.0);
    assert_eq!(profile.settings.music_volume, 0.2);
    assert_eq!(profile.settings.sfx_volume, 0.8);
    assert_eq!(profile.achievements[0].title, "First Expedition");
    assert_eq!(profile.achievements[0].progress, 70.0);
    assert!(profile.unlocked_skins[0].unlocked && profile.unlocked_skins[1].unlocked);
}

/// Reject malformed/future data rather than quietly overwriting a user's native save.
#[test]
fn invalid_profiles_and_metrics_are_rejected() {
    for value in [
        Value::Null,
        json!([]),
        json!({"schemaVersion": 2}),
        json!({"stats": {"totalCoins": -1}}),
        json!({"settings": {"musicVolume": 1.5}}),
        json!({"settings": {"showTouchControls": "sometimes"}}),
        json!({"selectedCharacterId": "maya"}),
        json!({"lastUpdated": u64::MAX}),
        json!({"recentRuns": [{"score": 3}]}),
    ] {
        assert!(normalize_profile(value).is_err());
    }
    for score in [-1.0, f64::NAN, f64::INFINITY, MAX_SAFE_NUMBER * 2.0] {
        let mut input = run();
        input.score = score;
        assert!(record_run(default_profile().unwrap(), input).is_err());
    }
}

/// Persist once, reload through a fresh cache, and never reimport over a native save/reset.
#[test]
fn migration_is_once_only_and_reset_survives_restart() {
    let directory = TestDirectory::new();
    let mut repository = directory.repository();
    assert_eq!(
        repository.execute(DataRequest::LoadProfile).unwrap(),
        Value::Null
    );
    repository
        .execute(DataRequest::InitializeProfile {
            legacy_profile: Some(json!({"stats": {"highScore": 9000}})),
        })
        .unwrap();
    let mut reopened = directory.repository();
    let profile = reopened
        .execute(DataRequest::InitializeProfile {
            legacy_profile: Some(json!({"stats": {"highScore": 1}})),
        })
        .unwrap();
    assert_eq!(profile["stats"]["highScore"], 9000.0);
    reopened.execute(DataRequest::ResetAllData).unwrap();
    let profile = directory
        .repository()
        .execute(DataRequest::LoadProfile)
        .unwrap();
    assert_eq!(profile["stats"]["highScore"], 0.0);
}

/// Round-trip exported native JSON through import and preserve committed state on invalid input.
#[test]
fn export_import_and_settings_round_trip() {
    let directory = TestDirectory::new();
    let mut repository = directory.repository();
    initialize(&mut repository);
    repository
        .execute(DataRequest::RecordRun { run_data: run() })
        .unwrap();
    repository
        .execute(DataRequest::UpdateSettings {
            settings: json!({"musicVolume": 0.3}),
        })
        .unwrap();
    let backup = repository
        .execute(DataRequest::ExportData)
        .unwrap()
        .as_str()
        .unwrap()
        .to_owned();
    repository.execute(DataRequest::ResetAllData).unwrap();
    let restored = repository
        .execute(DataRequest::ImportData {
            json_string: backup.clone(),
        })
        .unwrap();
    assert_eq!(restored["stats"]["totalRuns"], 1.0);
    assert_eq!(restored["settings"]["musicVolume"], 0.3);
    assert_eq!(restored["settings"]["sfxVolume"], 0.8);
    let committed = repository.execute(DataRequest::ExportData).unwrap();
    assert!(repository
        .execute(DataRequest::ImportData {
            json_string: "{".into()
        })
        .is_err());
    assert_eq!(
        repository.execute(DataRequest::ExportData).unwrap(),
        committed
    );
    assert!(repository
        .execute(DataRequest::UpdateSettings {
            settings: json!({"typo": 0.5})
        })
        .is_err());
    assert!(repository
        .execute(DataRequest::SelectCharacter {
            character_id: "maya".into()
        })
        .is_err());
}

/// A corrupt file is an error, not absence/defaults; bytes remain untouched.
#[test]
fn corrupt_native_save_is_not_overwritten() {
    let directory = TestDirectory::new();
    let path = directory.0.join("profile.json");
    fs::write(&path, b"invalid").unwrap();
    let mut repository = directory.repository();
    assert!(repository.execute(DataRequest::LoadProfile).is_err());
    assert!(repository
        .execute(DataRequest::InitializeProfile {
            legacy_profile: None
        })
        .is_err());
    assert_eq!(fs::read(path).unwrap(), b"invalid");
}

/// Failure before rename never changes cached data or leaves a staging file behind.
#[test]
fn failed_write_preserves_cache_and_cleans_staging_file() {
    let directory = TestDirectory::new();
    let mut repository = directory.repository();
    initialize(&mut repository);
    let backup = repository.execute(DataRequest::ExportData).unwrap();
    fs::remove_file(&repository.path).unwrap();
    fs::create_dir(&repository.path).unwrap();
    assert!(repository
        .execute(DataRequest::RecordRun { run_data: run() })
        .is_err());
    assert_eq!(repository.execute(DataRequest::ExportData).unwrap(), backup);
    assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
}

/// Concurrent callers share a locked read/modify/write transaction with no lost runs.
#[test]
fn concurrent_mutations_accumulate_without_lost_updates() {
    let directory = TestDirectory::new();
    let mut repository = directory.repository();
    initialize(&mut repository);
    let repository = Arc::new(Mutex::new(repository));
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let repository = Arc::clone(&repository);
            thread::spawn(move || {
                repository
                    .lock()
                    .unwrap()
                    .execute(DataRequest::RecordRun { run_data: run() })
                    .unwrap();
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    let persisted = directory
        .repository()
        .execute(DataRequest::LoadProfile)
        .unwrap();
    assert_eq!(persisted["stats"]["totalRuns"], 8.0);
    assert_eq!(persisted["stats"]["totalCoins"], 280.0);
}

/// Check the exact camel-case IPC request shape produced by the TypeScript bridge.
#[test]
fn ipc_envelope_uses_frontend_field_names() {
    let request: DataRequest = serde_json::from_value(json!({
        "operation": "recordRun", "runData": run()
    }))
    .unwrap();
    assert!(matches!(request, DataRequest::RecordRun { .. }));
    let request: DataRequest = serde_json::from_value(json!({
        "operation": "initializeProfile", "legacyProfile": null
    }))
    .unwrap();
    assert!(matches!(
        request,
        DataRequest::InitializeProfile {
            legacy_profile: None
        }
    ));
}

/// Exercise the actual Tauri command handler, managed state, blocking task, and IPC response.
#[test]
fn tauri_ipc_dispatches_native_operations_and_returns_errors() {
    let directory = TestDirectory::new();
    let app = tauri::test::mock_builder()
        .manage(DataBackend(Arc::new(Mutex::new(directory.repository()))))
        .invoke_handler(tauri::generate_handler![native_data])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    // Windows uses http://tauri.localhost, while Unix uses tauri://localhost.
    // Use the actual mock WebView URL so IPC retains its local-origin authority.
    let local_url = webview.url().unwrap();
    let invoke_from = |request: Value, url: &str| {
        tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "native_data".into(),
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
            json!({"operation": "loadProfile"}),
            "https://untrusted.example.invalid"
        )
        .is_err(),
        "Remote origins must not gain native profile access"
    );
    assert_eq!(
        invoke(json!({"operation": "loadProfile"})).unwrap(),
        Value::Null
    );
    invoke(json!({"operation": "initializeProfile", "legacyProfile": null})).unwrap();
    let outcome = invoke(json!({"operation": "recordRun", "runData": run()})).unwrap();
    assert_eq!(outcome["profile"]["stats"]["totalRuns"], 1.0);
    assert_eq!(outcome["newHighScore"], true);
    assert!(
        invoke(json!({"operation": "updateSettings", "settings": {"musicVolume": -1}})).is_err()
    );
    let profile = invoke(json!({"operation": "loadProfile"})).unwrap();
    assert_eq!(profile["settings"]["musicVolume"], 0.7);
}
