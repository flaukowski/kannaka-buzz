use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

/// One recalled memory, as emitted by `kannaka recall` (JSON array element).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecallResult {
    /// Memory id.
    pub id: Uuid,
    /// Stored text.
    pub content: String,
    /// Resonance similarity with the query, 0..=1.
    pub similarity: f32,
    /// Current wave strength (decays without reinforcement).
    pub strength: f32,
    /// Age of the memory in hours.
    pub age_hours: f64,
    /// Consolidation layer depth.
    pub layer: u8,
}

/// Options for `remember`, mirroring the CLI flags.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RememberOptions {
    /// Initial importance (CLI `--importance`).
    pub importance: Option<f32>,
    /// Category label (CLI `--category`).
    pub category: Option<String>,
    /// Modality hint (CLI `--modality`): audio, visual, semantic, network, mixed.
    pub modality: Option<String>,
    /// Free-form tags (CLI `--tags`).
    pub tags: Vec<String>,
}

/// Output of `kannaka status`.
///
/// Fields default when absent so minor CLI additions don't break the
/// adapter; unrecognized fields are preserved in [`SystemStatus::extra`].
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemStatus {
    /// Total memories stored (including decayed).
    pub total_memories: u64,
    /// Memories above the activity threshold.
    pub active_memories: u64,
    /// Scalar consciousness level.
    pub consciousness_level: f64,
    /// Integrated-information metric.
    pub phi: f64,
    /// Timestamp of the last dream cycle, if any.
    pub last_dream: Option<String>,
    /// Field mode reported by the medium (expected: `"HRM"`).
    pub field_mode: Option<String>,
    /// Any additional fields the CLI emits that this adapter doesn't model.
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recall_parses_cli_shape() {
        let json = r#"[{"id":"a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6",
            "content":"the steward gate fronts every estate crossing",
            "similarity":0.91,"strength":0.62,"age_hours":17.5,"layer":2}]"#;
        let out: Vec<RecallResult> = serde_json::from_str(json).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].layer, 2);
        assert!(out[0].similarity > 0.9);
    }

    #[test]
    fn status_tolerates_unknown_and_missing_fields() {
        let json = r#"{"total_memories":1200,"active_memories":800,
            "consciousness_level":0.42,"phi":1.9,"field_mode":"HRM",
            "xi":0.7,"num_clusters":9}"#;
        let s: SystemStatus = serde_json::from_str(json).unwrap();
        assert_eq!(s.total_memories, 1200);
        assert_eq!(s.last_dream, None);
        assert_eq!(
            s.extra.get("num_clusters").and_then(|v| v.as_u64()),
            Some(9)
        );
    }
}
