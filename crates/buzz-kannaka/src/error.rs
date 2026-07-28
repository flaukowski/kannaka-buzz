use std::time::Duration;

/// Errors surfaced by the Kannaka memory adapter.
#[derive(Debug, thiserror::Error)]
pub enum KannakaError {
    /// The `kannaka` binary could not be spawned (missing, not executable).
    #[error("failed to spawn kannaka binary `{bin}`: {source}")]
    Spawn {
        /// The binary path or name that was invoked.
        bin: String,
        /// The underlying I/O error.
        #[source]
        source: std::io::Error,
    },

    /// The CLI ran but exited non-zero; stderr carries the diagnostic.
    #[error("kannaka {command} exited with {status}: {stderr}")]
    CommandFailed {
        /// The subcommand that failed (e.g. `recall`).
        command: String,
        /// Process exit status.
        status: std::process::ExitStatus,
        /// Captured stderr, trimmed.
        stderr: String,
    },

    /// The CLI produced output this adapter could not parse.
    #[error("unparseable kannaka {command} output: {source}")]
    Parse {
        /// The subcommand whose output failed to parse.
        command: String,
        /// The underlying JSON/format error.
        #[source]
        source: serde_json::Error,
    },

    /// stdout was not valid UTF-8.
    #[error("kannaka {command} produced non-UTF-8 output")]
    NonUtf8 {
        /// The subcommand whose output was invalid.
        command: String,
    },

    /// The CLI did not finish within the configured deadline.
    #[error("kannaka {command} timed out after {timeout:?}")]
    Timeout {
        /// The subcommand that timed out.
        command: String,
        /// The deadline that elapsed.
        timeout: Duration,
    },
}
