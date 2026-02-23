"""
Scheduled image builder for repository snapshots.

This module handles:
- Periodic rebuilding of repository images (every 30 minutes)
- Cloning repos with GitHub App authentication
- Running setup/build commands to prime caches
- Creating filesystem snapshots for fast sandbox startup

Note: Uses lazy imports to avoid pydantic dependency at module load time.
"""

import contextlib
import hashlib
import os
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

from ..app import app, function_image, github_app_secrets, inspect_volume
from ..images.base import base_image


def _generate_github_app_token() -> str:
    """
    Generate a GitHub App installation token for cloning.

    Uses credentials from github_app_secrets:
    - GITHUB_APP_ID
    - GITHUB_APP_PRIVATE_KEY
    - GITHUB_APP_INSTALLATION_ID

    Returns:
        Installation token (valid ~1 hour), or empty string if not configured
    """
    from ..auth.github_app import generate_installation_token

    app_id = os.environ.get("GITHUB_APP_ID")
    private_key = os.environ.get("GITHUB_APP_PRIVATE_KEY")
    installation_id = os.environ.get("GITHUB_APP_INSTALLATION_ID")

    if not all([app_id, private_key, installation_id]):
        print("[builder] GitHub App credentials not configured, using unauthenticated clone")
        return ""

    try:
        token = generate_installation_token(
            app_id=app_id,
            private_key=private_key,
            installation_id=installation_id,
        )
        print("[builder] Generated GitHub App token for cloning")
        return token
    except Exception as e:
        print(f"[builder] Failed to generate GitHub App token: {e}")
        return ""


_ASKPASS_SCRIPT_PATH = "/tmp/git-askpass.sh"


def _get_clone_url(repo_owner: str, repo_name: str, token: str) -> str:
    """
    Get clone URL for a repository.

    When *token* is provided the URL uses ``x-access-token`` as the
    username but does **not** embed the password.  The actual token is
    supplied via GIT_ASKPASS (see ``_setup_git_askpass``).
    """
    if token:
        return f"https://x-access-token@github.com/{repo_owner}/{repo_name}.git"
    return f"https://github.com/{repo_owner}/{repo_name}.git"


def _setup_git_askpass(token: str) -> dict[str, str]:
    """
    Write a GIT_ASKPASS helper script and return env vars for git.

    The helper echoes the token when git asks for a password, keeping
    it out of remote URLs and process listings.

    Returns:
        dict of environment variable overrides for subprocess calls.
    """
    if not token:
        return {}

    fd = os.open(
        _ASKPASS_SCRIPT_PATH,
        os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
        0o700,
    )
    try:
        os.write(fd, f'#!/bin/sh\necho "{token}"\n'.encode())
    finally:
        os.close(fd)

    return {
        "GIT_ASKPASS": _ASKPASS_SCRIPT_PATH,
        "GIT_TERMINAL_PROMPT": "0",
    }


def _cleanup_git_askpass() -> None:
    """Remove the GIT_ASKPASS helper script."""
    with contextlib.suppress(FileNotFoundError):
        Path(_ASKPASS_SCRIPT_PATH).unlink()


@app.function(
    image=base_image,
    volumes={"/data": inspect_volume},
    secrets=[github_app_secrets],
    timeout=1800,  # 30 minutes
    memory=4096,
)
def build_repo_image(
    repo_owner: str,
    repo_name: str,
    default_branch: str = "main",
    setup_commands: list[str] | None = None,
    build_commands: list[str] | None = None,
) -> dict:
    """
    Build a repository image with dependencies installed.

    This function:
    1. Clones the repository
    2. Runs setup commands (e.g., install dependencies)
    3. Runs build commands (e.g., compile, generate)
    4. Creates a snapshot

    Args:
        repo_owner: GitHub repository owner
        repo_name: GitHub repository name
        default_branch: Branch to clone
        setup_commands: Commands to run for setup
        build_commands: Commands to run for building

    Returns:
        dict with snapshot_id and status
    """
    # Lazy imports to avoid pydantic at module load time
    from ..registry.models import Snapshot, SnapshotMetadata, SnapshotStatus
    from ..registry.store import SnapshotStore

    store = SnapshotStore()
    start_time = time.time()
    snapshot_id = f"snap-{repo_owner}-{repo_name}-{int(start_time * 1000)}"

    # Create initial snapshot record
    snapshot = Snapshot(
        id=snapshot_id,
        repo_owner=repo_owner,
        repo_name=repo_name,
        base_sha="",
        status=SnapshotStatus.BUILDING,
        created_at=datetime.utcnow(),
    )
    store.save_snapshot(snapshot)

    workspace = "/workspace"
    repo_path = f"{workspace}/{repo_name}"

    try:
        # Generate GitHub App token for private repos
        token = _generate_github_app_token()
        git_extra_env = _setup_git_askpass(token)
        clone_url = _get_clone_url(repo_owner, repo_name, token)

        print(f"[builder] Cloning {repo_owner}/{repo_name}...")

        # Clone repository (GIT_ASKPASS provides the token)
        git_env = {**os.environ, **git_extra_env}
        subprocess.run(
            ["git", "clone", "--depth=1", f"--branch={default_branch}", clone_url, repo_path],
            check=True,
            capture_output=True,
            env=git_env,
        )

        # Get current SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
        )
        base_sha = result.stdout.strip()
        print(f"[builder] Cloned at SHA: {base_sha}")

        # Auto-detect and run setup based on project files
        # Note: We always auto-detect rather than using explicit setup_commands
        # to avoid running wrong commands (e.g., npm install on Python projects)
        if setup_commands:
            print("[builder] Note: Ignoring explicit setup_commands, using auto-detection")
        await_run_auto_setup(repo_path)

        # Run build commands
        if build_commands:
            for cmd in build_commands:
                print(f"[builder] Running build: {cmd}")
                subprocess.run(cmd, shell=True, cwd=repo_path, check=True)

        # Get dependency hash for cache invalidation
        dep_hash = _get_dependency_hash(repo_path)

        # Detect versions
        node_version = _get_version("node", "--version")
        python_version = _get_version("python3", "--version")

        # Calculate build duration
        build_duration = time.time() - start_time

        # Create metadata
        metadata = SnapshotMetadata(
            snapshot_id=snapshot_id,
            repo_owner=repo_owner,
            repo_name=repo_name,
            base_sha=base_sha,
            base_branch=default_branch,
            build_timestamp=datetime.utcnow(),
            node_version=node_version,
            python_version=python_version,
            package_manager=_detect_package_manager(repo_path),
            dependency_hash=dep_hash,
        )

        # Update snapshot record
        snapshot.base_sha = base_sha
        snapshot.status = SnapshotStatus.READY
        snapshot.build_duration_seconds = build_duration
        snapshot.expires_at = datetime.utcnow() + timedelta(hours=24)

        store.save_snapshot(snapshot, metadata)

        print(f"[builder] Build complete in {build_duration:.1f}s")

        return {
            "snapshot_id": snapshot_id,
            "status": "success",
            "base_sha": base_sha,
            "build_duration": build_duration,
        }

    except Exception as e:
        print(f"[builder] Build failed: {e}")

        snapshot.status = SnapshotStatus.FAILED
        snapshot.error_message = str(e)
        store.save_snapshot(snapshot)

        return {
            "snapshot_id": snapshot_id,
            "status": "failed",
            "error": str(e),
        }

    finally:
        _cleanup_git_askpass()


def await_run_auto_setup(repo_path: str) -> None:
    """Auto-detect and run setup commands based on project files."""
    import os

    # Check for Node.js project
    if os.path.exists(f"{repo_path}/package.json"):
        # Detect package manager and run install
        # Use check=False to continue even if install fails (e.g., missing lockfile)
        if os.path.exists(f"{repo_path}/pnpm-lock.yaml"):
            print("[builder] Detected pnpm project")
            result = subprocess.run("pnpm install --frozen-lockfile", shell=True, cwd=repo_path)
            if result.returncode != 0:
                print("[builder] pnpm install failed, trying without frozen-lockfile")
                subprocess.run("pnpm install", shell=True, cwd=repo_path, check=False)
        elif os.path.exists(f"{repo_path}/yarn.lock"):
            print("[builder] Detected yarn project")
            result = subprocess.run("yarn install --frozen-lockfile", shell=True, cwd=repo_path)
            if result.returncode != 0:
                print("[builder] yarn install failed, trying without frozen-lockfile")
                subprocess.run("yarn install", shell=True, cwd=repo_path, check=False)
        elif os.path.exists(f"{repo_path}/bun.lockb"):
            print("[builder] Detected bun project")
            result = subprocess.run("bun install --frozen-lockfile", shell=True, cwd=repo_path)
            if result.returncode != 0:
                print("[builder] bun install failed, trying without frozen-lockfile")
                subprocess.run("bun install", shell=True, cwd=repo_path, check=False)
        elif os.path.exists(f"{repo_path}/package-lock.json"):
            print("[builder] Detected npm project with lockfile")
            result = subprocess.run("npm ci", shell=True, cwd=repo_path)
            if result.returncode != 0:
                print("[builder] npm ci failed, trying npm install")
                subprocess.run("npm install", shell=True, cwd=repo_path, check=False)
        else:
            print("[builder] Detected npm project (no lockfile)")
            subprocess.run("npm install", shell=True, cwd=repo_path, check=False)

    # Check for Python project
    if os.path.exists(f"{repo_path}/pyproject.toml") or os.path.exists(
        f"{repo_path}/requirements.txt"
    ):
        print("[builder] Detected Python project")
        if os.path.exists(f"{repo_path}/pyproject.toml"):
            subprocess.run("uv sync", shell=True, cwd=repo_path, check=False)
        elif os.path.exists(f"{repo_path}/requirements.txt"):
            subprocess.run(
                "uv pip install -r requirements.txt", shell=True, cwd=repo_path, check=False
            )


def _detect_package_manager(repo_path: str) -> str | None:
    """Detect which package manager is used."""
    import os

    if os.path.exists(f"{repo_path}/pnpm-lock.yaml"):
        return "pnpm"
    elif os.path.exists(f"{repo_path}/yarn.lock"):
        return "yarn"
    elif os.path.exists(f"{repo_path}/bun.lockb"):
        return "bun"
    elif os.path.exists(f"{repo_path}/package-lock.json"):
        return "npm"
    elif os.path.exists(f"{repo_path}/pyproject.toml"):
        return "uv"
    elif os.path.exists(f"{repo_path}/requirements.txt"):
        return "pip"
    return None


def _get_dependency_hash(repo_path: str) -> str | None:
    """Get hash of lock file for cache invalidation."""
    import os

    lock_files = [
        "pnpm-lock.yaml",
        "yarn.lock",
        "package-lock.json",
        "bun.lockb",
        "uv.lock",
        "requirements.txt",
    ]

    for lock_file in lock_files:
        path = f"{repo_path}/{lock_file}"
        if os.path.exists(path):
            with open(path, "rb") as f:
                return hashlib.sha256(f.read()).hexdigest()[:16]

    return None


def _get_version(cmd: str, arg: str) -> str | None:
    """Get version of a command."""
    try:
        result = subprocess.run([cmd, arg], capture_output=True, text=True)
        return result.stdout.strip()
    except Exception:
        return None


@app.function(
    image=function_image,
    # NOTE: Cron disabled - this feature was never wired up end-to-end.
    # The control plane has getLatestSnapshot() but never calls it, so
    # pre-built snapshots are never used. Re-enable once the feature is
    # completed or remove entirely if not needed.
    # schedule=modal.Cron("*/30 * * * *"),
    volumes={"/data": inspect_volume},
    timeout=1800,
)
def rebuild_repo_images():
    """
    Scheduled function to rebuild all registered repository images.

    Runs every 30 minutes to ensure snapshots have at most 30 minutes
    of code drift from the main branch.

    NOTE: Currently disabled (cron commented out). See comment above.
    """
    # Lazy imports to avoid pydantic at module load time
    from ..registry.store import SnapshotStore

    print("[scheduler] Starting scheduled image rebuild")

    store = SnapshotStore()
    repos = store.list_repositories()

    if not repos:
        print("[scheduler] No repositories registered")
        return {"rebuilt": 0, "failed": 0}

    results = {"rebuilt": 0, "failed": 0, "repos": []}

    for repo in repos:
        print(f"[scheduler] Building {repo.owner}/{repo.name}")

        try:
            result = build_repo_image.remote(
                repo_owner=repo.owner,
                repo_name=repo.name,
                default_branch=repo.default_branch,
                setup_commands=repo.setup_commands or None,
                build_commands=repo.build_commands or None,
            )

            if result["status"] == "success":
                results["rebuilt"] += 1
            else:
                results["failed"] += 1

            results["repos"].append(
                {
                    "owner": repo.owner,
                    "name": repo.name,
                    "status": result["status"],
                }
            )

        except Exception as e:
            print(f"[scheduler] Failed to build {repo.owner}/{repo.name}: {e}")
            results["failed"] += 1
            results["repos"].append(
                {
                    "owner": repo.owner,
                    "name": repo.name,
                    "status": "error",
                    "error": str(e),
                }
            )

    # Cleanup expired snapshots
    for repo in repos:
        deleted = store.cleanup_expired(repo.owner, repo.name)
        if deleted > 0:
            print(
                f"[scheduler] Cleaned up {deleted} expired snapshots for {repo.owner}/{repo.name}"
            )

    print(
        f"[scheduler] Rebuild complete: {results['rebuilt']} succeeded, {results['failed']} failed"
    )
    return results


@app.function(
    image=function_image,
    volumes={"/data": inspect_volume},
    timeout=1800,
)
def build_single_repo_image(
    repo_owner: str,
    repo_name: str,
    default_branch: str = "main",
    setup_commands: list[str] | None = None,
    build_commands: list[str] | None = None,
    register: bool = True,
) -> dict:
    """
    Build image for a single repository on demand.

    Optionally registers the repository for scheduled rebuilds.

    Args:
        repo_owner: GitHub repository owner
        repo_name: GitHub repository name
        default_branch: Branch to build from
        setup_commands: Custom setup commands
        build_commands: Custom build commands
        register: Whether to register for scheduled rebuilds

    Returns:
        dict with build result
    """
    # Lazy imports to avoid pydantic at module load time
    from ..registry.models import Repository
    from ..registry.store import SnapshotStore

    store = SnapshotStore()

    # Register repository if requested
    if register:
        repo = Repository(
            owner=repo_owner,
            name=repo_name,
            default_branch=default_branch,
            setup_commands=setup_commands or [],
            build_commands=build_commands or [],
        )
        store.save_repository(repo)
        print(f"[builder] Registered {repo_owner}/{repo_name} for scheduled rebuilds")

    # Build the image
    return build_repo_image.remote(
        repo_owner=repo_owner,
        repo_name=repo_name,
        default_branch=default_branch,
        setup_commands=setup_commands,
        build_commands=build_commands,
    )
