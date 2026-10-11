//! Native profile cache, catalog migration, progression, and transactional JSON persistence.
//!
//! Tauri dispatches operations on its blocking worker pool. One mutex protects the
//! repository, so read/modify/write operations cannot overwrite one another.
//! A sibling temporary file is flushed and renamed before the cached state changes.

pub mod models;

use models::*;
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

/// Process-local suffix for run IDs and exclusive temporary files.
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Checked epoch clock rather than a success-shaped fallback on clock errors.
fn now_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    u64::try_from(duration.as_millis()).map_err(|e| e.to_string())
}

/// Decode the shared default catalog and stamp creation times.
pub fn default_profile() -> Result<LocalProfile, String> {
    let mut profile: LocalProfile = serde_json::from_str(include_str!("default-profile.json"))
        .map_err(|e| format!("Invalid bundled profile catalog: {e}"))?;
    let now = now_ms()?;
    profile.last_updated = now;
    profile.stats.last_played_timestamp = now;
    Ok(profile)
}

/// Fill missing object fields from defaults; supplied wrong types remain validation errors.
fn merge_defaults(target: &mut Value, saved: &Value) {
    if let (Some(target), Some(saved)) = (target.as_object_mut(), saved.as_object()) {
        for (key, value) in saved {
            if let Some(default) = target.get_mut(key) {
                if default.is_object() && value.is_object() {
                    merge_defaults(default, value);
                } else {
                    *default = value.clone();
                }
            }
        }
    }
}

/// Normalize legacy/backed-up profiles while retaining authoritative catalog metadata.
///
/// Missing fields receive defaults; known catalog entries recover only progression
/// fields by ID. Unknown saved entries are dropped and Harry remains unlocked.
/// Malformed values and future schemas return errors without replacing the save.
pub fn normalize_profile(saved: Value) -> Result<LocalProfile, String> {
    if !saved.is_object() {
        return Err("Profile backup must be a JSON object".into());
    }
    let mut defaults = serde_json::to_value(default_profile()?).map_err(|e| e.to_string())?;
    merge_defaults(&mut defaults, &saved);
    for (catalog, fields) in [
        ("achievements", &["progress", "unlocked", "unlockedAt"][..]),
        ("unlockedSkins", &["unlocked"][..]),
    ] {
        let mut entries = serde_json::from_str::<Value>(include_str!("default-profile.json"))
            .map_err(|e| e.to_string())?[catalog]
            .clone();
        if let Some(saved_entries) = saved.get(catalog) {
            let saved_entries = saved_entries
                .as_array()
                .ok_or_else(|| format!("{catalog} must be an array"))?;
            for entry in entries.as_array_mut().ok_or("Invalid bundled catalog")? {
                if let Some(previous) = saved_entries.iter().rev().find(|s| s["id"] == entry["id"])
                {
                    for field in fields {
                        if let Some(value) = previous.get(*field) {
                            entry[*field] = value.clone();
                        }
                    }
                }
            }
        }
        defaults[catalog] = entries;
    }
    let mut profile: LocalProfile =
        serde_json::from_value(defaults).map_err(|e| format!("Invalid profile backup: {e}"))?;
    if profile.schema_version != 1 {
        return Err(format!(
            "Unsupported profile schema version: {}",
            profile.schema_version
        ));
    }
    profile.unlocked_skins[0].unlocked = true;
    if !profile
        .unlocked_skins
        .iter()
        .any(|s| s.id == profile.selected_character_id && s.unlocked)
    {
        return Err("Selected explorer must be known and unlocked".into());
    }
    profile.recent_runs.truncate(50);
    validate_profile(&profile)?;
    Ok(profile)
}

/// Validate numeric metrics before they cross the JavaScript/native boundary.
fn validate_numbers(values: &[f64]) -> Result<(), String> {
    if values
        .iter()
        .any(|n| !n.is_finite() || *n < 0.0 || *n > MAX_SAFE_NUMBER)
    {
        Err("Profile metrics must be finite, nonnegative, JavaScript-safe numbers".into())
    } else {
        Ok(())
    }
}

/// Reject unsafe seed/metric inputs while retaining the historical death-code rules.
fn validate_run(run: &RunInput) -> Result<(), String> {
    validate_numbers(&[
        run.score,
        run.distance_meters,
        run.coins_collected,
        run.relics_collected,
        run.hazards_avoided,
        run.vines_swung,
    ])?;
    if (run.seed as f64).abs() > MAX_SAFE_NUMBER {
        return Err("Run seed exceeds the JavaScript-safe integer range".into());
    }
    if !["harry", "maya", "leo"].contains(&run.character_id.as_str()) {
        return Err("Unknown run explorer".into());
    }
    Ok(())
}

/// Validate accumulated totals, settings discriminators/gains, and restored runs.
fn validate_profile(profile: &LocalProfile) -> Result<(), String> {
    let s = &profile.stats;
    validate_numbers(&[
        s.total_runs,
        s.total_distance_meters,
        s.total_coins,
        s.total_relics,
        s.high_score,
        s.longest_distance_meters,
        s.most_vines_swung_in_single_run,
        s.total_hazards_avoided,
        s.last_played_timestamp as f64,
        profile.last_updated as f64,
    ])?;
    let settings = &profile.settings;
    if ![settings.music_volume, settings.sfx_volume]
        .iter()
        .all(|n| n.is_finite() && (0.0..=1.0).contains(n))
    {
        return Err("Audio volumes must be in [0, 1]".into());
    }
    if !["low", "medium", "high"].contains(&settings.particle_density.as_str())
        || !["auto", "always", "never"].contains(&settings.show_touch_controls.as_str())
    {
        return Err("Invalid presentation preference".into());
    }
    for achievement in &profile.achievements {
        validate_numbers(&[achievement.progress])?;
        if let Some(timestamp) = achievement.unlocked_at {
            validate_numbers(&[timestamp as f64])?;
        }
    }
    for run in &profile.recent_runs {
        validate_run(&run.input)?;
        validate_numbers(&[run.timestamp as f64])?;
    }
    Ok(())
}

/// Pure progression transition; saving and cache commitment are handled separately.
fn record_run(mut profile: LocalProfile, input: RunInput) -> Result<RecordOutcome, String> {
    validate_run(&input)?;
    let now = now_ms()?;
    let new_high_score = input.score > profile.stats.high_score;
    let new_longest_distance = input.distance_meters > profile.stats.longest_distance_meters;
    let stats = &mut profile.stats;
    stats.high_score = stats.high_score.max(input.score);
    stats.longest_distance_meters = stats.longest_distance_meters.max(input.distance_meters);
    stats.total_runs += 1.0;
    stats.total_distance_meters += input.distance_meters;
    stats.total_coins += input.coins_collected;
    stats.total_relics += input.relics_collected;
    stats.total_hazards_avoided += input.hazards_avoided;
    stats.most_vines_swung_in_single_run =
        stats.most_vines_swung_in_single_run.max(input.vines_swung);
    stats.last_played_timestamp = now;

    let mut unlocked_achievements = Vec::new();
    for a in &mut profile.achievements {
        if a.unlocked {
            continue;
        }
        // Preserve existing counting rules, including death-code-based avoidance goals.
        let progress = match a.id.as_str() {
            "first_steps" | "deep_trek" | "jungle_sovereign" => {
                a.progress.max(input.distance_meters)
            }
            "vine_apprentice" => a.progress.max(input.vines_swung),
            "vine_master" => a.progress + input.vines_swung,
            "coin_collector" => stats.total_coins,
            "relic_hunter" => stats.total_relics,
            "crocodile_dodger" => {
                a.progress
                    + if input.cause_of_death != "crocodile" {
                        1.0
                    } else {
                        0.0
                    }
            }
            "boulder_survivor" => {
                a.progress
                    + if input.cause_of_death != "boulder" {
                        1.0
                    } else {
                        0.0
                    }
            }
            "centurion" => stats.total_runs,
            "high_scorer" => a.progress.max(input.score),
            _ => a.progress,
        };
        a.progress = progress.min(a.max_progress);
        if a.progress >= a.max_progress {
            a.unlocked = true;
            a.unlocked_at = Some(now);
            unlocked_achievements.push(a.title.clone());
        }
    }
    let mut unlocked_skins = Vec::new();
    for skin in &mut profile.unlocked_skins {
        if !skin.unlocked
            && ((skin.id == "maya" && stats.total_coins >= 50.0)
                || (skin.id == "leo" && stats.total_distance_meters >= 1000.0))
        {
            skin.unlocked = true;
            unlocked_skins.push(skin.name.clone());
        }
    }
    profile.recent_runs.insert(
        0,
        RunRecord {
            id: format!("run_{now}_{}", SEQUENCE.fetch_add(1, Ordering::Relaxed)),
            timestamp: now,
            input,
        },
    );
    profile.recent_runs.truncate(30);
    validate_profile(&profile)?;
    Ok(RecordOutcome {
        profile,
        new_high_score,
        new_longest_distance,
        unlocked_achievements,
        unlocked_skins,
    })
}

/// Cached native repository with a fixed app-owned path, never supplied by IPC callers.
pub struct NativeRepository {
    /// Application-data JSON path resolved by Tauri during setup.
    path: PathBuf,
    /// Last loaded or successfully committed profile; never speculative mutation state.
    profile: Option<LocalProfile>,
}

impl NativeRepository {
    /// Create a lazy repository without file I/O on the Tauri setup thread.
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            profile: None,
        }
    }

    /// Load once; absent files return null, while corruption/read errors propagate.
    fn load(&mut self) -> Result<Option<LocalProfile>, String> {
        if self.profile.is_none() {
            match fs::read(&self.path) {
                Ok(bytes) => {
                    let saved = serde_json::from_slice(&bytes)
                        .map_err(|e| format!("Cannot decode native profile: {e}"))?;
                    self.profile = Some(normalize_profile(saved)?);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(e) => return Err(format!("Cannot read native profile: {e}")),
            }
        }
        Ok(self.profile.clone())
    }

    /// Require initialization rather than silently creating defaults during a mutation.
    fn required_profile(&mut self) -> Result<LocalProfile, String> {
        self.load()?
            .ok_or_else(|| "Native profile has not been initialized".into())
    }

    /// Flush a unique sibling file, replace the save, then commit the cached snapshot.
    fn save(&mut self, mut profile: LocalProfile) -> Result<LocalProfile, String> {
        validate_profile(&profile)?;
        profile.last_updated = now_ms()?;
        let parent = self
            .path
            .parent()
            .ok_or("Native profile path has no parent")?;
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create profile directory: {e}"))?;
        let temporary = parent.join(format!(
            ".profile-{}-{}.tmp",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let mut staged = false;
        let result = (|| -> Result<(), String> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|e| format!("Cannot create profile staging file: {e}"))?;
            staged = true;
            serde_json::to_writer(&mut file, &profile)
                .map_err(|e| format!("Cannot serialize profile: {e}"))?;
            file.flush()
                .and_then(|_| file.sync_all())
                .map_err(|e| format!("Cannot flush profile: {e}"))?;
            drop(file);
            fs::rename(&temporary, &self.path)
                .map_err(|e| format!("Cannot replace profile: {e}"))?;
            Ok(())
        })();
        if let Err(error) = result {
            if staged {
                if let Err(cleanup) = fs::remove_file(&temporary) {
                    eprintln!("Cannot remove profile staging file: {cleanup}");
                }
            }
            return Err(error);
        }
        self.profile = Some(profile.clone());
        Ok(profile)
    }

    /// Execute one complete operation while its caller holds the repository mutex.
    pub fn execute(&mut self, request: DataRequest) -> Result<Value, String> {
        match request {
            DataRequest::LoadProfile => {
                serde_json::to_value(self.load()?).map_err(|e| e.to_string())
            }
            DataRequest::InitializeProfile { legacy_profile } => {
                let profile = match self.load()? {
                    Some(profile) => profile,
                    None => self.save(match legacy_profile {
                        Some(saved) => normalize_profile(saved)?,
                        None => default_profile()?,
                    })?,
                };
                serde_json::to_value(profile).map_err(|e| e.to_string())
            }
            DataRequest::UpdateSettings { settings } => {
                let mut profile = self.required_profile()?;
                let patch = settings
                    .as_object()
                    .ok_or("Settings patch must be an object")?;
                let mut value =
                    serde_json::to_value(&profile.settings).map_err(|e| e.to_string())?;
                for (key, setting) in patch {
                    if value.get(key).is_none() {
                        return Err(format!("Unknown preference: {key}"));
                    }
                    value[key] = setting.clone();
                }
                profile.settings = serde_json::from_value(value)
                    .map_err(|e| format!("Invalid preference: {e}"))?;
                serde_json::to_value(self.save(profile)?).map_err(|e| e.to_string())
            }
            DataRequest::SelectCharacter { character_id } => {
                let mut profile = self.required_profile()?;
                if !profile
                    .unlocked_skins
                    .iter()
                    .any(|s| s.id == character_id && s.unlocked)
                {
                    return Err("Explorer must be known and unlocked".into());
                }
                profile.selected_character_id = character_id;
                serde_json::to_value(self.save(profile)?).map_err(|e| e.to_string())
            }
            DataRequest::RecordRun { run_data } => {
                let mut outcome = record_run(self.required_profile()?, run_data)?;
                outcome.profile = self.save(outcome.profile)?;
                serde_json::to_value(outcome).map_err(|e| e.to_string())
            }
            DataRequest::ExportData => {
                let json = serde_json::to_string_pretty(&self.required_profile()?)
                    .map_err(|e| e.to_string())?;
                Ok(Value::String(json))
            }
            DataRequest::ImportData { json_string } => {
                let saved = serde_json::from_str(&json_string)
                    .map_err(|e| format!("Invalid backup JSON: {e}"))?;
                serde_json::to_value(self.save(normalize_profile(saved)?)?)
                    .map_err(|e| e.to_string())
            }
            DataRequest::ResetAllData => {
                serde_json::to_value(self.save(default_profile()?)?).map_err(|e| e.to_string())
            }
        }
    }
}

/// Managed handle cloned into blocking tasks, keeping file work off the event loop.
pub struct DataBackend(pub Arc<Mutex<NativeRepository>>);

/// Dispatch typed profile operations on the blocking worker pool, never falling back on failure.
#[tauri::command]
pub async fn native_data(
    state: tauri::State<'_, DataBackend>,
    request: DataRequest,
) -> Result<Value, String> {
    let repository = Arc::clone(&state.0);
    let result = tauri::async_runtime::spawn_blocking(move || {
        repository
            .lock()
            .map_err(|e| format!("Native profile lock failed: {e}"))?
            .execute(request)
    })
    .await
    .map_err(|e| format!("Native profile task failed: {e}"))?;
    if let Err(error) = &result {
        eprintln!("Native data operation failed: {error}");
    }
    result
}

#[cfg(test)]
mod tests;
