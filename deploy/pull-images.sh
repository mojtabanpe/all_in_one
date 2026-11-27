#!/bin/sh
# Pulls `all-in-one-<target>:$RELEASE` from GHCR on the production server.
# 1. If `pkg-containers.githubusercontent.com` (GHCR's Fastly blob CDN) completes a direct TLS handshake,
#    uses `docker pull` directly.
# 2. When `dockerd` hits direct TLS handshake timeouts to `pkg-containers.githubusercontent.com` (or `docker pull`
#    fails), pulls the authoritative OCI manifest from `ghcr.io`, reuses the contiguous layer prefix already unpacked
#    in local `all-in-one-<target>:*` images on the server, downloads only the changed layer blobs (trying Liara's
#    free GHCR mirror `ghcr-mirror.liara.ir` with an anonymous Harbor token first, then falling back automatically to
#    `ghcr.io` via the local loopback tunnel proxy), verifies every blob's SHA-256 digest against the `ghcr.io`
#    manifest, loads the OCI archive into Docker and verifies the image rootfs with `docker run --rm --entrypoint true`.
#
# Usage:
#   REGISTRY=ghcr.io/mojtabanpe RELEASE=<sha> GHCR_TOKEN=<token> sh deploy/pull-images.sh api public web
set -eu

: "${REGISTRY:?}" "${RELEASE:?}"
DIR=${RUNNER_TEMP:-/tmp}/aio-ghcr-pull-$$
export DOCKER_CONFIG="$DIR/docker-config"
mkdir -p "$DOCKER_CONFIG"
trap 'rm -rf "$DIR"' EXIT

ACTOR=${GITHUB_ACTOR:-${REGISTRY#*/}}
PROXY=${AIO_PULL_PROXY:-http://127.0.0.1:7890}
MIRROR=${AIO_GHCR_MIRROR:-ghcr-mirror.liara.ir}

direct_cdn_ok=false
if curl -sSI -o /dev/null --connect-timeout 4 --max-time 6 https://pkg-containers.githubusercontent.com/ 2>/dev/null; then
  direct_cdn_ok=true
fi

logged_in=false
if [ "$direct_cdn_ok" = true ] && [ -n "${GHCR_TOKEN:-}" ]; then
  if printf '%s\n' "$GHCR_TOKEN" | timeout 30 docker login ghcr.io -u "$ACTOR" --password-stdin >/dev/null 2>&1; then
    logged_in=true
  fi
fi

oci_delta_pull() {
  target=$1
  python3 - "$REGISTRY" "$RELEASE" "$target" "$DIR" "$PROXY" "$direct_cdn_ok" "$MIRROR" <<'PY'
import base64
import hashlib
import io
import json
import os
import socket
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request

registry, release, target, workdir, proxy_url, direct_cdn_arg, mirror_host = sys.argv[1:8]
direct_cdn_ok = direct_cdn_arg == "true"
owner = registry.split("/", 1)[1]
repo = f"{owner}/all-in-one-{target}"
local_tag = f"all-in-one-{target}:{release}"
token_secret = os.environ.get("GHCR_TOKEN", "")
actor = os.environ.get("GITHUB_ACTOR", owner)

def proxy_reachable(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 7890
        with socket.create_connection((host, port), timeout=1.5):
            return True
    except OSError:
        return False

has_proxy = proxy_reachable(proxy_url)
prefer_proxy = has_proxy and not direct_cdn_ok

def curl_bytes(url: str, headers: list[str], use_proxy: bool, timeout_sec: int = 30) -> bytes:
    cmd = [
        "curl", "-fsSL",
        "--connect-timeout", "10",
        "--max-time", str(timeout_sec),
    ]
    if use_proxy:
        cmd.extend(["-x", proxy_url])
    for h in headers:
        cmd.extend(["-H", h])
    cmd.append(url)
    return subprocess.check_output(cmd)

def fetch_json_with_fallback(url: str, headers: list[str]) -> tuple[bytes, dict]:
    modes = [False, True] if has_proxy else [False]
    last_err = None
    for use_proxy in modes:
        try:
            raw = curl_bytes(url, headers, use_proxy=use_proxy, timeout_sec=30)
            return raw, json.loads(raw.decode("utf-8"))
        except Exception as err:
            last_err = err
    raise RuntimeError(f"Failed to fetch {url}: {last_err}")

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

mirror_token = ""
if mirror_host:
    try:
        raw_mt = curl_bytes(
            f"https://{mirror_host}/service/token?service=harbor-registry&scope=repository:{repo}:pull",
            [],
            use_proxy=False,
            timeout_sec=8,
        )
        mirror_token = json.loads(raw_mt.decode("utf-8")).get("token", "")
    except Exception:
        mirror_token = ""
    if mirror_token:
        try:
            # Warm Harbor's proxy-cache for this tag so subsequent blob requests by digest hit the mirror cache.
            curl_bytes(
                f"https://{mirror_host}/v2/{repo}/manifests/{release}",
                [
                    f"Authorization: Bearer {mirror_token}",
                    "Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
                ],
                use_proxy=False,
                timeout_sec=15,
            )
        except Exception:
            pass

def download_blob(digest: str, expected_size: int, token: str, blob_dir: str) -> str:
    global prefer_proxy, mirror_token
    alg, hex_digest = digest.split(":", 1)
    if alg != "sha256":
        raise RuntimeError(f"Unsupported digest algorithm: {digest}")
    dest = os.path.join(blob_dir, hex_digest)
    if os.path.exists(dest) and sha256_file(dest) == hex_digest:
        return hex_digest

    # 1. Try Liara GHCR mirror first (anonymous Harbor token only; never send GitHub tokens to the mirror).
    if mirror_host and mirror_token:
        mirror_url = f"https://{mirror_host}/v2/{repo}/blobs/{digest}"
        m_cmd = [
            "curl", "-fsSL", "-C", "-",
            "--connect-timeout", "8",
            "--speed-limit", "102400",
            "--speed-time", "15",
            "-H", f"Authorization: Bearer {mirror_token}",
            "-o", dest, mirror_url,
        ]
        if subprocess.call(m_cmd) == 0 and os.path.exists(dest):
            actual = sha256_file(dest)
            if actual == hex_digest:
                return hex_digest
            print(f"::warning::Mirror blob {hex_digest[:12]} sha256 mismatch ({actual[:12]}); falling back to ghcr.io", flush=True)
            try:
                os.remove(dest)
            except OSError:
                pass
        else:
            try:
                os.remove(dest)
            except OSError:
                pass

    url = f"https://ghcr.io/v2/{repo}/blobs/{digest}"
    headers = [f"Authorization: Bearer {token}"]
    # When direct TLS to pkg-containers.githubusercontent.com is filtered and local proxy is up, try proxy first.
    if has_proxy and prefer_proxy:
        attempt_modes = [True, True, False, True, True, False]
    elif has_proxy:
        attempt_modes = [False, True, True, False, True, True]
    else:
        attempt_modes = [False] * 6

    for attempt, use_proxy in enumerate(attempt_modes, start=1):
        cmd = [
            "curl", "-fsSL", "-C", "-",
            "--connect-timeout", "15",
            "--speed-limit", "102400",
            "--speed-time", "20",
        ]
        if use_proxy:
            cmd.extend(["-x", proxy_url])
        for h in headers:
            cmd.extend(["-H", h])
        cmd.extend(["-o", dest, url])
        rc = subprocess.call(cmd)
        if rc == 0 and os.path.exists(dest):
            actual = sha256_file(dest)
            if actual == hex_digest:
                return hex_digest
            print(f"::warning::Blob {hex_digest[:12]} sha256 mismatch ({actual[:12]}); retrying", flush=True)
            try:
                os.remove(dest)
            except OSError:
                pass
        else:
            if not use_proxy and has_proxy:
                prefer_proxy = True
            mode_label = "proxy" if use_proxy else "direct"
            print(f"::warning::Blob {hex_digest[:12]} ({expected_size // 1024} KiB) interrupted via {mode_label} (attempt {attempt})", flush=True)
        time.sleep(2)

    raise RuntimeError(f"Could not download blob {digest} for {local_tag}")

def local_diff_id_chains(image_repo: str) -> list[list[str]]:
    try:
        tags_out = subprocess.check_output(
            ["docker", "image", "ls", image_repo, "--format", "{{.Repository}}:{{.Tag}}"],
            text=True,
        ).splitlines()
    except Exception:
        return []
    refs = [r.strip() for r in tags_out if r.strip() and "<none>" not in r]
    if not refs:
        return []
    try:
        inspected = json.loads(
            subprocess.check_output(["docker", "image", "inspect", *refs], text=True)
        )
    except Exception:
        return []
    chains = []
    for img in inspected:
        layers = (img.get("RootFS") or {}).get("Layers") or []
        if layers:
            chains.append(layers)
    return chains

def verify_image(tag: str) -> bool:
    return subprocess.call(
        ["docker", "run", "--rm", "--entrypoint", "true", tag],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ) == 0

start_ts = time.time()
token_headers = []
if token_secret:
    basic = base64.b64encode(f"{actor}:{token_secret}".encode("utf-8")).decode("ascii")
    token_headers.append(f"Authorization: Basic {basic}")

_, token_data = fetch_json_with_fallback(
    f"https://ghcr.io/token?service=ghcr.io&scope=repository:{repo}:pull",
    token_headers,
)
token = token_data["token"]

accept_manifest = (
    "Accept: application/vnd.oci.image.manifest.v1+json, "
    "application/vnd.docker.distribution.manifest.v2+json, "
    "application/vnd.oci.image.index.v1+json, "
    "application/vnd.docker.distribution.manifest.list.v2+json"
)
manifest_bytes, manifest = fetch_json_with_fallback(
    f"https://ghcr.io/v2/{repo}/manifests/{release}",
    [f"Authorization: Bearer {token}", accept_manifest],
)

if "manifests" in manifest and "layers" not in manifest:
    chosen = next(
        (
            m for m in manifest["manifests"]
            if (m.get("platform") or {}).get("os") == "linux"
            and (m.get("platform") or {}).get("architecture") == "amd64"
        ),
        manifest["manifests"][0],
    )
    manifest_bytes, manifest = fetch_json_with_fallback(
        f"https://ghcr.io/v2/{repo}/manifests/{chosen['digest']}",
        [f"Authorization: Bearer {token}", accept_manifest],
    )

manifest_hex = hashlib.sha256(manifest_bytes).hexdigest()
blob_dir = os.path.join(workdir, f"blobs-{target}")
os.makedirs(blob_dir, exist_ok=True)
with open(os.path.join(blob_dir, manifest_hex), "wb") as f:
    f.write(manifest_bytes)

config_desc = manifest["config"]
config_hex = download_blob(config_desc["digest"], config_desc.get("size", 0), token, blob_dir)
with open(os.path.join(blob_dir, config_hex), "rb") as f:
    config = json.loads(f.read().decode("utf-8"))

diff_ids = (config.get("rootfs") or {}).get("diff_ids") or []
layers = manifest.get("layers") or []
if len(diff_ids) != len(layers):
    raise RuntimeError(f"Mismatched diff_ids ({len(diff_ids)}) and layers ({len(layers)})")

# Find the longest contiguous prefix of diff_ids already unpacked in local Docker for this image repository.
existing_chains = local_diff_id_chains(f"all-in-one-{target}")
reused_prefix = 0
for chain in existing_chains:
    match_len = 0
    for a, b in zip(diff_ids, chain):
        if a == b:
            match_len += 1
        else:
            break
    if match_len > reused_prefix:
        reused_prefix = match_len

def load_with_prefix(skip_prefix: int) -> tuple[int, int]:
    downloaded_bytes = 0
    included_layer_hexes = []
    for idx, layer in enumerate(layers):
        if idx < skip_prefix:
            continue
        size = int(layer.get("size") or 0)
        hex_digest = download_blob(layer["digest"], size, token, blob_dir)
        included_layer_hexes.append(hex_digest)
        downloaded_bytes += size

    index_obj = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.index.v1+json",
        "manifests": [
            {
                "mediaType": manifest.get("mediaType", "application/vnd.oci.image.manifest.v1+json"),
                "digest": f"sha256:{manifest_hex}",
                "size": len(manifest_bytes),
                "annotations": {
                    "containerd.io/distribution.source.ghcr.io": repo,
                    "io.containerd.image.name": f"docker.io/library/{local_tag}",
                    "org.opencontainers.image.ref.name": release,
                },
            }
        ],
    }

    tar_path = os.path.join(workdir, f"{target}-oci.tar")
    with tarfile.open(tar_path, mode="w") as tf:
        def add_bytes(name: str, data: bytes) -> None:
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))

        add_bytes("oci-layout", b'{"imageLayoutVersion":"1.0.0"}')
        add_bytes("index.json", json.dumps(index_obj).encode("utf-8"))
        tf.add(os.path.join(blob_dir, manifest_hex), arcname=f"blobs/sha256/{manifest_hex}")
        tf.add(os.path.join(blob_dir, config_hex), arcname=f"blobs/sha256/{config_hex}")
        for hex_digest in included_layer_hexes:
            tf.add(os.path.join(blob_dir, hex_digest), arcname=f"blobs/sha256/{hex_digest}")

    subprocess.run(["docker", "load", "-i", tar_path], check=True)
    try:
        os.remove(tar_path)
    except OSError:
        pass
    return len(included_layer_hexes), downloaded_bytes

fetched_count, transferred = load_with_prefix(reused_prefix)
if not verify_image(local_tag):
    if reused_prefix > 0:
        print(f"::warning::Rootfs check for {local_tag} needed full layers; fetching remaining {reused_prefix} layers", flush=True)
        fetched_count, transferred = load_with_prefix(0)
    if not verify_image(local_tag):
        raise RuntimeError(f"Loaded image {local_tag} failed rootfs verification")

elapsed = int(time.time() - start_ts)
mib = transferred / 1048576.0
print(
    f"Pulled {target} via OCI delta ({fetched_count}/{len(layers)} layers, {mib:.1f} MiB transferred, "
    f"{len(layers) - fetched_count} layers reused) in {elapsed}s",
    flush=True,
)
PY
}

for t in "$@"; do
  ref="$REGISTRY/all-in-one-$t:$RELEASE"
  local_tag="all-in-one-$t:$RELEASE"
  if [ "$logged_in" = true ]; then
    start=$(date +%s)
    if timeout 180 docker pull "$ref"; then
      docker tag "$ref" "$local_tag"
      docker image rm "$ref" >/dev/null
      if docker run --rm --entrypoint true "$local_tag" >/dev/null 2>&1; then
        echo "Pulled $t in $(($(date +%s) - start))s"
        continue
      fi
    fi
    echo "::warning::Direct docker pull of $ref failed; using OCI delta pull"
  fi
  oci_delta_pull "$t"
done
