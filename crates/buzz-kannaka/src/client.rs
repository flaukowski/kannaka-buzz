use crate::error::KannakaError;
use crate::types::{RecallResult, RememberOptions, SystemStatus};
use crate::MemoryService;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use uuid::Uuid;

/// Environment variable overriding the `kannaka` binary path.
pub const BIN_ENV: &str = "BUZZ_KANNAKA_BIN";
/// Environment variable naming the HRM data directory, passed through to the CLI.
pub const DATA_DIR_ENV: &str = "KANNAKA_DATA_DIR";

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Subprocess-backed Kannaka client (ADR-0016 contract: CLI + JSON stdout).
#[derive(Debug, Clone)]
pub struct KannakaCli {
    bin: PathBuf,
    data_dir: Option<PathBuf>,
    timeout: Duration,
}

impl Default for KannakaCli {
    fn default() -> Self {
        Self::new()
    }
}

impl KannakaCli {
    /// Client using `$BUZZ_KANNAKA_BIN` (or `kannaka` on `PATH`) and the
    /// CLI's own data-dir resolution (`$KANNAKA_DATA_DIR` / `~/.kannaka`).
    pub fn new() -> Self {
        let bin = std::env::var_os(BIN_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("kannaka"));
        Self {
            bin,
            data_dir: None,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// Pin the HRM data directory (exported as `KANNAKA_DATA_DIR` to the child).
    pub fn with_data_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.data_dir = Some(dir.into());
        self
    }

    /// Override the per-command deadline (default 30 s).
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Run `kannaka <args>` and return trimmed stdout.
    async fn run(&self, args: &[&str]) -> Result<String, KannakaError> {
        let command = args.first().copied().unwrap_or_default().to_string();
        let mut cmd = Command::new(&self.bin);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(dir) = &self.data_dir {
            cmd.env(DATA_DIR_ENV, dir);
        }
        tracing::debug!(bin = %self.bin.display(), ?args, "invoking kannaka CLI");

        let child = cmd.spawn().map_err(|source| KannakaError::Spawn {
            bin: self.bin.display().to_string(),
            source,
        })?;
        let output = tokio::time::timeout(self.timeout, child.wait_with_output())
            .await
            .map_err(|_| KannakaError::Timeout {
                command: command.clone(),
                timeout: self.timeout,
            })?
            .map_err(|source| KannakaError::Spawn {
                bin: self.bin.display().to_string(),
                source,
            })?;

        if !output.status.success() {
            return Err(KannakaError::CommandFailed {
                command,
                status: output.status,
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            });
        }
        let stdout =
            String::from_utf8(output.stdout).map_err(|_| KannakaError::NonUtf8 { command })?;
        Ok(stdout.trim().to_string())
    }

    /// Run a dream consolidation cycle; returns the CLI's human-readable
    /// report verbatim (the CLI does not emit JSON for `dream`).
    pub async fn dream(&self, deep: bool) -> Result<String, KannakaError> {
        let mode = if deep { "deep" } else { "lite" };
        self.run(&["dream", "--mode", mode]).await
    }

    /// Full `observe --json` system report, untyped.
    pub async fn observe(&self) -> Result<serde_json::Value, KannakaError> {
        let out = self.run(&["observe", "--json"]).await?;
        serde_json::from_str(&out).map_err(|source| KannakaError::Parse {
            command: "observe".into(),
            source,
        })
    }

    /// Delete a memory by id.
    pub async fn forget(&self, id: Uuid) -> Result<(), KannakaError> {
        self.run(&["forget", &id.to_string()]).await.map(|_| ())
    }
}

impl MemoryService for KannakaCli {
    async fn remember(&self, text: &str, opts: RememberOptions) -> Result<Uuid, KannakaError> {
        let mut args: Vec<String> = vec!["remember".into(), text.into()];
        if let Some(importance) = opts.importance {
            args.extend(["--importance".into(), importance.to_string()]);
        }
        if let Some(category) = &opts.category {
            args.extend(["--category".into(), category.clone()]);
        }
        if let Some(modality) = &opts.modality {
            args.extend(["--modality".into(), modality.clone()]);
        }
        if !opts.tags.is_empty() {
            args.push("--tags".into());
            args.extend(opts.tags.iter().cloned());
        }
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = self.run(&arg_refs).await?;
        // `remember` prints the bare UUID of the new memory.
        out.parse().map_err(|_| KannakaError::Parse {
            command: "remember".into(),
            source: serde_json::Error::io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("expected UUID on stdout, got: {out}"),
            )),
        })
    }

    async fn recall(&self, query: &str, top_k: usize) -> Result<Vec<RecallResult>, KannakaError> {
        let k = top_k.to_string();
        let out = self.run(&["recall", query, "--top-k", &k]).await?;
        if out.is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str(&out).map_err(|source| KannakaError::Parse {
            command: "recall".into(),
            source,
        })
    }

    async fn status(&self) -> Result<SystemStatus, KannakaError> {
        let out = self.run(&["status"]).await?;
        serde_json::from_str(&out).map_err(|source| KannakaError::Parse {
            command: "status".into(),
            source,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn missing_binary_is_a_spawn_error() {
        let client = KannakaCli {
            bin: PathBuf::from("kannaka-definitely-not-installed"),
            data_dir: None,
            timeout: DEFAULT_TIMEOUT,
        };
        let err = client.recall("anything", 3).await.unwrap_err();
        assert!(matches!(err, KannakaError::Spawn { .. }), "got: {err}");
    }

    /// Round-trip against a real `kannaka` binary when one is on PATH.
    /// Ignored by default so CI without the constellation stays green.
    #[tokio::test]
    #[ignore = "requires a kannaka binary on PATH"]
    async fn live_status_round_trip() {
        let client = KannakaCli::new();
        let status = client.status().await.unwrap();
        assert!(status.total_memories >= status.active_memories);
    }
}
