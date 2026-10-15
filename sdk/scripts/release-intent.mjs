import assert from "node:assert/strict";

// Source-directory publishes cannot silently lose provenance now that the
// package default is absent. The owner handoff publishes a verified .tgz with
// --ignore-scripts and --provenance-file, never this working directory.
assert.equal(process.env.npm_config_provenance, "true", "Source publication requires explicit --provenance; use the verified tarball handoff for --provenance-file");
