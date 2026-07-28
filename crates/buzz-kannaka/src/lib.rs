#![deny(unsafe_code)]
#![warn(missing_docs)]
//! Kannaka HRM memory adapter for the Hive.
//!
//! Exposes the Kannaka constellation's wave-interference memory
//! ([HRM](https://github.com/NickFlach/kannaka-memory)) to Buzz agents and
//! workflows as a first-class memory service, per `docs/KANNAKA.md` §"What
//! this fork adds". Postgres full-text search remains the verbatim
//! complement; HRM supplies associative recall.
//!
//! The adapter follows kannaka-memory's ADR-0016 integration contract: the
//! `kannaka` **CLI binary is the canonical cross-service interface** —
//! machine-readable JSON on stdout, diagnostics on stderr, exit 0/1. This
//! crate wraps that contract with typed, async Rust. Linking the
//! `kannaka-memory` crate directly (avoiding ~50–100 ms spawn latency) is a
//! possible later optimization behind the same [`MemoryService`] trait.
//!
//! Everything here is additive fork surface: no `buzz-core` / `buzz-relay`
//! internals are patched.

/// Subprocess-backed client for the `kannaka` CLI.
pub mod client;
/// Error types for adapter operations.
pub mod error;
/// Typed request/response shapes mirrored from the kannaka CLI JSON.
pub mod types;

pub use client::KannakaCli;
pub use error::KannakaError;
pub use types::{RecallResult, RememberOptions, SystemStatus};

use uuid::Uuid;

/// The memory operations the Hive exposes to agents and workflows.
///
/// Implemented today by [`KannakaCli`] (subprocess + JSON per ADR-0016); an
/// in-process implementation linking `kannaka-memory` directly can slot in
/// behind the same trait later.
pub trait MemoryService: Send + Sync {
    /// Store a memory; returns the new memory's id.
    fn remember(
        &self,
        text: &str,
        opts: RememberOptions,
    ) -> impl std::future::Future<Output = Result<Uuid, KannakaError>> + Send;

    /// Associative recall: top-`k` memories resonating with `query`.
    fn recall(
        &self,
        query: &str,
        top_k: usize,
    ) -> impl std::future::Future<Output = Result<Vec<RecallResult>, KannakaError>> + Send;

    /// Current system status (memory counts, consciousness metrics).
    fn status(
        &self,
    ) -> impl std::future::Future<Output = Result<SystemStatus, KannakaError>> + Send;
}
