//! Deterministic world planning on native blocking workers.
//!
//! The catalog, tier/biome filtering, Mulberry32 stream, and terrain-gap expansion
//! live here. Phaser retains real-time physics, sprite construction and animation:
//! no physics frames cross IPC. Requests carry their own continuation, so failed
//! or abandoned calls never mutate native state or leak per-run sessions.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Authoritative shared authored recipes, also imported by the lazy browser fallback.
const CATALOG_JSON: &str = include_str!("chunk-catalog.json");
/// Largest ordered batch accepted by the worker.
const MAX_BATCH: usize = 64;
/// Largest exact JavaScript integer accepted as a selection-time distance.
const MAX_DISTANCE: f64 = 9_007_199_254_740_991.0;
/// Shared scene gravity/jump tuning used to derive conservative tile reach.
const MOVEMENT_JSON: &str = include_str!("movement.json");

/// Movement values consumed by both the frontend physics and native gap planner.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Movement {
    /// World acceleration in pixels/second squared.
    world_gravity: f64,
    /// Additional body acceleration.
    player_gravity: f64,
    /// Initial upward ground-jump speed.
    jump_velocity: f64,
    /// Minimum forward speed used for conservative reach.
    minimum_run_speed: f64,
    /// Landing/reaction reserve in pixels.
    landing_margin: f64,
    /// Rasterized terrain tile width.
    tile_width: f64,
}

/// Whole-tile reach at minimum speed; the optional air boost is not required.
fn jump_limit() -> f64 {
    let m: Movement = serde_json::from_str(MOVEMENT_JSON).expect("Invalid bundled movement tuning");
    let reach = |velocity: f64| {
        ((2.0 * velocity * m.minimum_run_speed / (m.world_gravity + m.player_gravity)
            - m.landing_margin)
            / m.tile_width)
            .floor()
            * m.tile_width
    };
    reach(m.jump_velocity)
}

/// Shared staged opening and distance thresholds.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pacing {
    /// Hazard-free opening.
    safe_start_meters: f64,
    /// Only safe/log recipes before this distance.
    warmup_meters: f64,
    /// Advanced hazards begin here.
    tier2_meters: f64,
    /// Temple hazards begin here.
    tier3_meters: f64,
    /// Gauntlet begins here.
    tier4_meters: f64,
}

/// Parse bundled progression once, shared with frontend tuning.
fn pacing() -> &'static Pacing {
    static PACING: OnceLock<Pacing> = OnceLock::new();
    PACING.get_or_init(|| {
        serde_json::from_str(include_str!("pacing.json")).expect("Invalid bundled pacing")
    })
}

/// Authored environment and cycling selection preference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Biome {
    /// Initial forest environment.
    Canopy,
    /// Crocodile and quicksand environment.
    Swamp,
    /// Ancient ruin environment.
    Temple,
    /// Late-game gauntlet environment.
    Cavern,
}

/// Authored obstacle discriminators; runtime bodies retain existing scene behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObstacleType {
    /// Bottomless void.
    Pit,
    /// Water surface replacing solid ground.
    WaterLagoon,
    /// Bounce/damage hazard.
    Crocodile,
    /// Ground jumping hazard.
    Log,
    /// Sliding hazard.
    OverheadBranch,
    /// Pendulum traversal helper.
    SwingVine,
    /// Moving hazard.
    RollingBoulder,
    /// Ground spikes.
    SpikeTrap,
    /// Slowing terrain without ground tiles.
    Quicksand,
    /// Small ground hazard.
    Snake,
    /// Scene plank recipe.
    CollapsingBridge,
}

/// Optional logical vine geometry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObstacleMeta {
    /// Vine length in virtual pixels.
    pub length: f64,
}

/// Chunk-local authored obstacle; optional fields retain their original semantics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Obstacle {
    /// Hazard or traversal identity.
    pub r#type: ObstacleType,
    /// Horizontal center in chunk-local pixels.
    pub x_offset: f64,
    /// Authored Y offset, not universally applied by the scene.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y_offset: Option<f64>,
    /// Gap width or authored solid width.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    /// Authored height.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    /// Moving hazard velocity in pixels/second.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    /// Optional vine length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ObstacleMeta>,
}

/// Score and temporary-effect pickup identities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CollectibleType {
    /// Multiplied 100-point pickup.
    Coin,
    /// Multiplied 500-point pickup.
    Relic,
    /// One-hit protection.
    PowerupShield,
    /// Timed coin attraction.
    PowerupMagnet,
}

/// Chunk-local pickup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collectible {
    /// Pickup effect identity.
    pub r#type: CollectibleType,
    /// Horizontal chunk offset.
    pub x_offset: f64,
    /// Vertical offset relative to ground.
    pub y_offset: f64,
}

/// Reserved decoration identities, not currently rendered by the scene.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecorationType {
    /// Forest scenery.
    Tree,
    /// Ground foliage.
    Fern,
    /// Temple scenery.
    RuinPillar,
    /// Intended flame scenery.
    Torch,
    /// Overhead foliage.
    HangingMoss,
    /// Intended distant waterfall.
    WaterfallBg,
}

/// Reserved chunk-local scenery metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decoration {
    /// Scenery identity.
    pub r#type: DecorationType,
    /// Horizontal chunk offset.
    pub x_offset: f64,
    /// Vertical offset.
    pub y_offset: f64,
}

/// Authoritative authored world segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    /// Stable repeat-avoidance identity.
    pub id: String,
    /// Display title.
    pub name: String,
    /// Horizontal span in virtual pixels.
    pub width: f64,
    /// First unlocked tier.
    pub min_tier: u8,
    /// Authored biome.
    pub biome: Biome,
    /// Terrain/traversal/hazard recipes.
    pub obstacles: Vec<Obstacle>,
    /// Pickup recipes.
    pub collectibles: Vec<Collectible>,
    /// Optional reserved scenery.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decorations: Option<Vec<Decoration>>,
}

/// Renderer surface at a tile center.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Surface {
    /// Static collidable tile.
    Ground,
    /// Noncollidable water image.
    WaterLagoon,
    /// Slowing hazard tile.
    Quicksand,
    /// No tile or sprite.
    Pit,
}

/// Native-computed 64-pixel tile recipe.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainTile {
    /// Chunk-local center coordinate.
    pub x_offset: f64,
    /// Surface selected by first inclusive matching gap.
    pub r#type: Surface,
}

/// Render-ready chunk and terrain plan, preserving the flat frontend shape.
#[derive(Debug, Clone, Serialize)]
pub struct PlannedChunk {
    /// Authored recipe flattened into the IPC object.
    #[serde(flatten)]
    pub chunk: Chunk,
    /// Ordered tile-center surface decisions.
    pub tiles: Vec<TerrainTile>,
}

/// Serializable continuation; an intermediate zero accumulator is valid.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorldState {
    /// Unsigned Mulberry32 accumulator.
    pub rng_state: u32,
    /// Previous recipe ID, empty only before the first selection.
    pub last_chunk_id: String,
}

/// One bounded world-planning request.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldRequest {
    /// Last successfully committed frontend continuation.
    pub state: WorldState,
    /// Actual selection-time distances, processed in order.
    pub distances: Vec<f64>,
}

/// Entire successful batch; failed requests return no continuation.
#[derive(Debug, Serialize)]
pub struct WorldBatch {
    /// State after the last returned segment.
    pub state: WorldState,
    /// One plan for each requested distance, in order.
    pub chunks: Vec<PlannedChunk>,
}

/// Parse and audit the embedded catalog once; malformed assets fail explicitly.
fn catalog() -> Result<&'static Vec<Chunk>, String> {
    static CATALOG: OnceLock<Result<Vec<Chunk>, String>> = OnceLock::new();
    CATALOG
        .get_or_init(|| {
            let mut chunks: Vec<Chunk> = serde_json::from_str(CATALOG_JSON)
                .map_err(|error| format!("Invalid embedded world catalog: {error}"))?;
            if chunks.is_empty() {
                return Err("World catalog is empty".into());
            }
            let mut ids = std::collections::HashSet::new();
            for chunk in &mut chunks {
                normalize_gaps(chunk)?;
                if !ids.insert(&chunk.id)
                    || chunk.id.is_empty()
                    || chunk.width != 960.0
                    || !(1..=4).contains(&chunk.min_tier)
                    || !validate_solvability(chunk)
                {
                    return Err(format!("Invalid embedded world recipe: {}", chunk.id));
                }
            }
            Ok(chunks)
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Mulberry32 preserving JavaScript Math.imul and unsigned-coercion semantics.
fn next(state: &mut u32) -> f64 {
    *state = state.wrapping_add(0x6d2b79f5);
    let mut t = (*state ^ (*state >> 15)).wrapping_mul(*state | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    f64::from(t ^ (t >> 14)) / 4_294_967_296.0
}

/// Tier transitions follow the shared extended introduction.
fn difficulty(distance: f64) -> u8 {
    if distance < pacing().tier2_meters {
        1
    } else if distance < pacing().tier3_meters {
        2
    } else if distance < pacing().tier4_meters {
        3
    } else {
        4
    }
}

/// Cycle preferred biomes every 400 game meters.
fn biome(distance: f64) -> Biome {
    match (distance / 400.0).floor() as u64 % 4 {
        0 => Biome::Canopy,
        1 => Biome::Swamp,
        2 => Biome::Temple,
        _ => Biome::Cavern,
    }
}

/// Static adjacent-center spacing heuristic; not a full physics/playability simulation.
fn validate_solvability(chunk: &Chunk) -> bool {
    if !validate_jump_gaps(chunk) {
        return false;
    }
    let mut obstacles: Vec<_> = chunk.obstacles.iter().collect();
    obstacles.sort_by(|a, b| a.x_offset.total_cmp(&b.x_offset));
    obstacles.windows(2).all(|pair| {
        let (a, b) = (pair[0], pair[1]);
        (a.r#type == ObstacleType::Pit && b.r#type == ObstacleType::SwingVine)
            || (a.r#type == ObstacleType::WaterLagoon && b.r#type == ObstacleType::Crocodile)
            || b.x_offset - a.x_offset >= 140.0
    })
}

/// Every contiguous rasterized void must be directly jumpable; helpers do not exempt widths.
fn validate_jump_gaps(chunk: &Chunk) -> bool {
    let jump = jump_limit();
    let tiles = plan_terrain(chunk);
    let mut index = 0;
    while index < tiles.len() {
        if !matches!(tiles[index].r#type, Surface::Pit | Surface::WaterLagoon) {
            index += 1;
            continue;
        }
        let start = tiles[index].x_offset - 32.0;
        let mut end = start;
        while index < tiles.len()
            && matches!(tiles[index].r#type, Surface::Pit | Surface::WaterLagoon)
        {
            end = tiles[index].x_offset + 32.0;
            index += 1;
        }
        if end - start > jump {
            return false;
        }
    }
    true
}

/// Reduce unsupported gaps before publication; obstacle widths and terrain remain consistent.
fn normalize_gaps(chunk: &mut Chunk) -> Result<(), String> {
    while !validate_jump_gaps(chunk) {
        let index = chunk
            .obstacles
            .iter()
            .enumerate()
            .filter(|(_, o)| matches!(o.r#type, ObstacleType::Pit | ObstacleType::WaterLagoon))
            .max_by(|(_, a), (_, b)| {
                a.width
                    .unwrap_or(140.0)
                    .total_cmp(&b.width.unwrap_or(140.0))
            })
            .map(|(i, _)| i)
            .ok_or_else(|| format!("Cannot make world gaps jumpable: {}", chunk.id))?;
        let width = chunk.obstacles[index].width.unwrap_or(140.0) - 64.0;
        if width <= 0.0 {
            chunk.obstacles.remove(index);
        } else {
            chunk.obstacles[index].width = Some(width);
        }
    }
    Ok(())
}

/// Expand terrain using inclusive tile centers and first authored gap precedence.
fn plan_terrain(chunk: &Chunk) -> Vec<TerrainTile> {
    let mut tiles = Vec::new();
    let mut x = 0.0;
    while x < chunk.width {
        let center = x + 32.0;
        let gap = chunk.obstacles.iter().find(|obstacle| {
            matches!(
                obstacle.r#type,
                ObstacleType::Pit | ObstacleType::WaterLagoon | ObstacleType::Quicksand
            ) && (center - obstacle.x_offset).abs()
                <= obstacle.width.filter(|w| *w != 0.0).unwrap_or(140.0) / 2.0
        });
        let surface = match gap.map(|o| o.r#type) {
            Some(ObstacleType::Pit) => Surface::Pit,
            Some(ObstacleType::WaterLagoon) => Surface::WaterLagoon,
            Some(ObstacleType::Quicksand) => Surface::Quicksand,
            _ => Surface::Ground,
        };
        tiles.push(TerrainTile {
            x_offset: center,
            r#type: surface,
        });
        x += 64.0;
    }
    tiles
}

/// Select and plan an ordered batch without mutating managed native state.
fn plan_world(request: WorldRequest) -> Result<WorldBatch, String> {
    if request.distances.is_empty()
        || request.distances.len() > MAX_BATCH
        || request
            .distances
            .iter()
            .any(|d| !d.is_finite() || !(0.0..=MAX_DISTANCE).contains(d))
    {
        return Err("World batch requires 1 through 64 finite nonnegative safe distances".into());
    }
    let catalog = catalog()?;
    let mut state = request.state;
    if !state.last_chunk_id.is_empty() && !catalog.iter().any(|c| c.id == state.last_chunk_id) {
        return Err("Unknown previous world recipe".into());
    }
    let mut chunks = Vec::with_capacity(request.distances.len());
    for distance in request.distances {
        let available: Vec<_> = catalog
            .iter()
            .filter(|chunk| {
                chunk.min_tier <= difficulty(distance)
                    && (distance >= pacing().warmup_meters
                        || chunk.id == "warmup_stroll"
                        || (distance >= pacing().safe_start_meters && chunk.id == "intro_flat"))
            })
            .collect();
        let mut eligible: Vec<_> = available
            .iter()
            .copied()
            .filter(|c| c.id != state.last_chunk_id)
            .collect();
        if eligible.is_empty() {
            eligible = available;
        }
        let matches: Vec<_> = eligible
            .iter()
            .copied()
            .filter(|chunk| chunk.biome == biome(distance))
            .collect();
        if !matches.is_empty() && next(&mut state.rng_state) > 0.3 {
            eligible = matches;
        }
        let chosen =
            eligible[(next(&mut state.rng_state) * eligible.len() as f64).floor() as usize];
        state.last_chunk_id.clone_from(&chosen.id);
        chunks.push(PlannedChunk {
            chunk: chosen.clone(),
            tiles: plan_terrain(chosen),
        });
    }
    Ok(WorldBatch { state, chunks })
}

/// Generate recipes and terrain on a blocking worker; command failures reject to the UI.
#[tauri::command]
pub async fn native_world(request: WorldRequest) -> Result<WorldBatch, String> {
    let result = tauri::async_runtime::spawn_blocking(move || plan_world(request))
        .await
        .map_err(|error| format!("World worker failed: {error}"))
        .and_then(|result| result);
    if let Err(error) = &result {
        eprintln!("Native world planning failed: {error}");
    }
    result
}

#[cfg(test)]
mod tests;
