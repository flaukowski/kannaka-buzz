//! Kannaka HRM memory tools — the Hive's associative memory in every agent
//! session (docs/KANNAKA.md Phase 2). Thin MCP surface over
//! `buzz_kannaka::KannakaCli`; binary resolution and data-dir selection
//! follow that crate (`BUZZ_KANNAKA_BIN`, `KANNAKA_DATA_DIR`).

use buzz_kannaka::{KannakaCli, MemoryService, RememberOptions};
use rmcp::ErrorData;
use schemars::JsonSchema;
use serde::Deserialize;

const DEFAULT_TOP_K: usize = 5;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RememberParams {
    /// The text to store as a memory.
    pub text: String,
    /// Initial importance weighting, 0..=1.
    #[serde(default)]
    pub importance: Option<f32>,
    /// Category label (free-form).
    #[serde(default)]
    pub category: Option<String>,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RecallParams {
    /// What to recall — memories resonating with this text are returned.
    pub query: String,
    /// Maximum results to return. Defaults to 5.
    #[serde(default)]
    pub top_k: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct StatusParams {}

fn adapter_error(err: buzz_kannaka::KannakaError) -> ErrorData {
    ErrorData::internal_error(format!("kannaka: {err}"), None)
}

pub async fn remember(p: RememberParams) -> Result<String, ErrorData> {
    let opts = RememberOptions {
        importance: p.importance,
        category: p.category,
        modality: None,
        tags: p.tags.unwrap_or_default(),
    };
    let id = KannakaCli::new()
        .remember(&p.text, opts)
        .await
        .map_err(adapter_error)?;
    Ok(format!("Remembered as {id}"))
}

pub async fn recall(p: RecallParams) -> Result<String, ErrorData> {
    let results = KannakaCli::new()
        .recall(&p.query, p.top_k.unwrap_or(DEFAULT_TOP_K))
        .await
        .map_err(adapter_error)?;
    if results.is_empty() {
        return Ok("No resonating memories.".to_string());
    }
    let mut out = format!("{} memories:\n", results.len());
    for r in &results {
        out.push_str(&format!(
            "- [{}] (similarity {:.2}, strength {:.2}, {:.1}h old, layer {}) {}\n",
            r.id, r.similarity, r.strength, r.age_hours, r.layer, r.content
        ));
    }
    Ok(out)
}

pub async fn status(_p: StatusParams) -> Result<String, ErrorData> {
    let s = KannakaCli::new().status().await.map_err(adapter_error)?;
    serde_json::to_string_pretty(&s)
        .map_err(|e| ErrorData::internal_error(format!("kannaka: serialize status: {e}"), None))
}
