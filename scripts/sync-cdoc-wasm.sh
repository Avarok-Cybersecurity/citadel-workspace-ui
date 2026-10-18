#!/usr/bin/env bash
# Builds cdoc-wasm from a citadel-docs checkout and vendors one fresh glue/binary pair, the
# Carlito faces and a PROVENANCE.json naming exactly what was built.
#
#   CARGO_TARGET_DIR=/path/to/own/target scripts/sync-cdoc-wasm.sh /path/to/citadel-docs
#
# The pair is coupled by export tables: a glue from one build against a binary from another
# fails at instantiation or, worse, calls the wrong export. So both halves are written by this
# one script from one build, and PROVENANCE.json records the source commit and both hashes;
# src/lib/cdoc/__tests__/vendored-pair.test.ts refuses a pair whose hashes disagree with it.
#
# Nothing is defaulted. The checkout, the target dir and the tool versions are explicit, a
# dirty checkout is refused (its commit would not name what was built), and the wasm-bindgen
# CLI must match the wasm-bindgen crate in the checkout's Cargo.lock. No timestamp is written:
# the same commit and tools produce byte-identical output.
set -euo pipefail

die() { echo "sync-cdoc-wasm: $*" >&2; exit 1; }

DOCS="${1:-}"
[ -n "$DOCS" ] || die "usage: CARGO_TARGET_DIR=<dir> $0 <citadel-docs checkout>"
[ -f "$DOCS/crates/cdoc-wasm/Cargo.toml" ] || die "$DOCS is not a citadel-docs checkout"
[ -n "${CARGO_TARGET_DIR:-}" ] || die "set CARGO_TARGET_DIR to a target dir of your own (never a shared one)"
command -v wasm-bindgen >/dev/null || die "wasm-bindgen CLI not found (cargo install wasm-bindgen-cli --version <lock version>)"
command -v wasm-opt >/dev/null || die "wasm-opt not found (binaryen)"
command -v node >/dev/null || die "node not found"

UI="$(cd "$(dirname "$0")/.." && pwd)"
# Not under public/wasm/: that directory is build output, which the parent's sync-wasm-clients.sh
# empties before every build, and this binary is vendored and committed.
WASM_OUT="$UI/public/cdoc"
# The glue sits outside src/ as well: it is tool output as long as the API it binds, which no
# hand-written-module rule (the 250-line cap) should judge. Only the short typed manifest is in src.
GLUE_OUT="$UI/vendor/cdoc"
MANIFEST_OUT="$UI/src/lib/cdoc/generated/font-manifest.ts"
FONT_OUT="$UI/public/fonts/cdoc"
# The URL the glue loads its binary from; src/lib/cdoc/asset-urls.ts holds the same string and
# the vendored-pair test asserts the two agree.
WASM_URL="/cdoc/cdoc_wasm_bg.wasm"

[ -z "$(git -C "$DOCS" status --porcelain)" ] || die "$DOCS has uncommitted changes; PROVENANCE would not name what was built"
COMMIT="$(git -C "$DOCS" rev-parse HEAD)"

LOCK_BINDGEN="$(awk '/^name = "wasm-bindgen"$/ { getline; gsub(/version = |"/, ""); print; exit }' "$DOCS/Cargo.lock")"
CLI_BINDGEN="$(wasm-bindgen --version | awk '{ print $2 }')"
[ "$LOCK_BINDGEN" = "$CLI_BINDGEN" ] || die "wasm-bindgen CLI $CLI_BINDGEN does not match the crate $LOCK_BINDGEN in Cargo.lock"
WASM_OPT_VERSION="$(wasm-opt --version | awk '{ print $3 }')"

echo "Building cdoc-wasm at $COMMIT (wasm-bindgen $CLI_BINDGEN, wasm-opt $WASM_OPT_VERSION)"
(cd "$DOCS" && cargo build --locked --release --target wasm32-unknown-unknown -p cdoc-wasm)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
wasm-bindgen --target web --out-dir "$STAGE" --out-name cdoc_wasm \
  "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/cdoc_wasm.wasm"
wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
  --enable-mutable-globals --enable-reference-types --enable-multivalue \
  "$STAGE/cdoc_wasm_bg.wasm" -o "$STAGE/cdoc_wasm_bg.opt.wasm"

# The glue's default is a URL relative to its own module, which Vite would try to bundle as a
# hashed asset beside the chunk. The binary is served (and precached) at one stable URL instead.
DEFAULT_URL="new URL('cdoc_wasm_bg.wasm', import.meta.url)"
[ "$(grep -cF "$DEFAULT_URL" "$STAGE/cdoc_wasm.js")" = "1" ] || die "the glue's default binary URL changed shape; update this script"
node -e '
  const fs = require("node:fs");
  const [file, from, to] = process.argv.slice(1);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(from, JSON.stringify(to)));
' "$STAGE/cdoc_wasm.js" "$DEFAULT_URL" "$WASM_URL"

mkdir -p "$WASM_OUT" "$GLUE_OUT" "$FONT_OUT" "$(dirname "$MANIFEST_OUT")"
cp "$STAGE/cdoc_wasm_bg.opt.wasm" "$WASM_OUT/cdoc_wasm_bg.wasm"
cp "$STAGE/cdoc_wasm.js" "$STAGE/cdoc_wasm.d.ts" "$GLUE_OUT/"

# Fonts: the faces the manifest says the UI serves (not its test fixtures), its licence, and a
# typed manifest reduced to what the font port reads. Each face's sha256 is checked on the way in.
node - "$DOCS/fonts" "$FONT_OUT" "$MANIFEST_OUT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [src, out, manifestOut] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
for (const face of manifest.faces) {
  const bytes = fs.readFileSync(path.join(src, face.file));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== face.sha256) throw new Error(`${face.file}: sha256 ${sha} is not the manifest's ${face.sha256}`);
  fs.writeFileSync(path.join(out, face.file), bytes);
}
fs.copyFileSync(path.join(src, manifest.licenseFile), path.join(out, manifest.licenseFile));
const reduced = {
  license: manifest.license,
  licenseFile: manifest.licenseFile,
  copyright: manifest.copyright,
  fallback: manifest.fallback,
  aliases: manifest.aliases,
  faces: manifest.faces.map(({ file, family, bold, italic, sha256 }) => ({ file, family, bold, italic, sha256 })),
};
fs.writeFileSync(manifestOut, [
  '// Generated by scripts/sync-cdoc-wasm.sh from citadel-docs fonts/manifest.json. Do not edit.',
  "import type { FontManifest } from '../fonts/font-manifest';",
  '',
  `export const FONT_MANIFEST: FontManifest = ${JSON.stringify(reduced, null, 2)};`,
  '',
].join('\n'));
NODE

node - "$GLUE_OUT/PROVENANCE.json" "$COMMIT" "$CLI_BINDGEN" "$WASM_OPT_VERSION" \
  "$WASM_OUT/cdoc_wasm_bg.wasm" "$GLUE_OUT/cdoc_wasm.js" "$GLUE_OUT/cdoc_wasm.d.ts" <<'NODE'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const [out, commit, bindgen, wasmOpt, wasm, glue, dts] = process.argv.slice(2);
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const provenance = {
  citadel_docs_commit: commit,
  wasm_bindgen_version: bindgen,
  wasm_opt_version: wasmOpt,
  wasm_sha256: sha(wasm),
  wasm_bytes: fs.statSync(wasm).size,
  glue_sha256: sha(glue),
  dts_sha256: sha(dts),
};
fs.writeFileSync(out, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(provenance);
NODE
