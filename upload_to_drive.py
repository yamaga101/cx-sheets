#!/usr/bin/env python3
"""
Upload Chrome extension to Google Drive (yamaga101).

Target: folder ID 19N3NGQundvR-gxaQsWBu71it-uVARn7B / subfolder "Sheets-Tab-Manager_vX.Y.Z"
Rules:
  - Upload individual files (no zip)
  - Subfolder created if absent; renamed on version update
  - Existing files overwritten; remote-only files left untouched
  - Only uploads extension runtime files (not source/config)
"""

import json
import os
import mimetypes
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ── Configuration ────────────────────────────────────────────────────────────

TOKEN_PATH    = os.path.expanduser("~/.config/google-api/token.json")
PARENT_ID     = "19N3NGQundvR-gxaQsWBu71it-uVARn7B"   # yamaga101 Drive parent folder
PROJECT_ROOT  = Path(__file__).parent

# Extension runtime files to upload (relative to project root)
EXTENSION_FILES = [
    "manifest.json",
    "service-worker-loader.js",
]
EXTENSION_DIRS = [
    "assets",
    "src/sidepanel",
    "src/icons",
]

def get_version() -> str:
    """Read version from manifest.json."""
    manifest = json.loads((PROJECT_ROOT / "manifest.json").read_text())
    return manifest["version"]

def get_subfolder_name() -> str:
    return f"Sheets-Tab-Manager_v{get_version()}"

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_service():
    creds = Credentials.from_authorized_user_file(TOKEN_PATH)
    return build("drive", "v3", credentials=creds)


def find_or_create_folder(service, name: str, parent_id: str) -> str:
    """Return folder ID, creating it if it doesn't exist."""
    query = (
        f"name='{name}' "
        f"and '{parent_id}' in parents "
        f"and mimeType='application/vnd.google-apps.folder' "
        f"and trashed=false"
    )
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get("files", [])
    if files:
        folder_id = files[0]["id"]
        print(f"[FOUND]  Subfolder '{name}' → {folder_id}")
        return folder_id

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = service.files().create(body=metadata, fields="id").execute()
    folder_id = folder["id"]
    print(f"[CREATE] Subfolder '{name}' → {folder_id}")
    return folder_id


def list_files_in_folder(service, folder_id: str) -> dict[str, str]:
    """Return {filename: file_id} for all non-folder files directly in folder."""
    query = f"'{folder_id}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    return {f["name"]: f["id"] for f in results.get("files", [])}


def guess_mime(local_path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(local_path))
    return mime or "application/octet-stream"


def upload_file(service, local_path: Path, filename: str, parent_id: str, existing_files: dict):
    """Create or update a single file on Drive."""
    mime = guess_mime(local_path)
    media = MediaFileUpload(str(local_path), mimetype=mime, resumable=False)

    if filename in existing_files:
        file_id = existing_files[filename]
        service.files().update(
            fileId=file_id,
            media_body=media,
        ).execute()
        print(f"[UPDATE] {filename}")
    else:
        metadata = {"name": filename, "parents": [parent_id]}
        service.files().create(
            body=metadata,
            media_body=media,
            fields="id",
        ).execute()
        print(f"[CREATE] {filename}")


def ensure_subfolder_tree(service, rel_parts: list[str], root_id: str, folder_cache: dict) -> str:
    """
    Walk rel_parts (path components of the directory relative to dist/),
    creating Drive subfolders as needed. Return the leaf folder ID.
    folder_cache maps tuple(parts) → folder_id.
    """
    current_id = root_id
    for i, part in enumerate(rel_parts):
        key = tuple(rel_parts[: i + 1])
        if key in folder_cache:
            current_id = folder_cache[key]
            continue
        # Find or create this subfolder under current_id
        query = (
            f"name='{part}' "
            f"and '{current_id}' in parents "
            f"and mimeType='application/vnd.google-apps.folder' "
            f"and trashed=false"
        )
        results = service.files().list(q=query, fields="files(id)").execute()
        children = results.get("files", [])
        if children:
            fid = children[0]["id"]
        else:
            metadata = {
                "name": part,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [current_id],
            }
            fid = service.files().create(body=metadata, fields="id").execute()["id"]
            print(f"[CREATE] folder '{'/'.join(rel_parts[:i+1])}'")
        folder_cache[key] = fid
        current_id = fid
    return current_id


# ── Main ──────────────────────────────────────────────────────────────────────

def rename_existing_folder(service, new_name: str, parent_id: str) -> str | None:
    """Find existing Sheets-Tab-Manager_v* folder and rename it. Return folder ID."""
    query = (
        f"name contains 'Sheets-Tab-Manager_v' "
        f"and '{parent_id}' in parents "
        f"and mimeType='application/vnd.google-apps.folder' "
        f"and trashed=false"
    )
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get("files", [])
    if not files:
        return None

    folder = files[0]
    if folder["name"] == new_name:
        print(f"[OK]     Folder already named '{new_name}'")
        return folder["id"]

    service.files().update(
        fileId=folder["id"],
        body={"name": new_name},
    ).execute()
    print(f"[RENAME] '{folder['name']}' → '{new_name}'")
    return folder["id"]


def collect_extension_files() -> list[Path]:
    """Collect all extension runtime files to upload."""
    files: list[Path] = []
    for f in EXTENSION_FILES:
        p = PROJECT_ROOT / f
        if p.exists():
            files.append(p)
    for d in EXTENSION_DIRS:
        dp = PROJECT_ROOT / d
        if dp.exists():
            files.extend(sorted(f for f in dp.rglob("*") if f.is_file()))
    return files


def main():
    subfolder_name = get_subfolder_name()
    print(f"Uploading Sheets Tab Manager v{get_version()} to Google Drive")
    print(f"Folder: {subfolder_name}\n")

    service = get_service()

    # Rename existing folder or create new one
    root_id = rename_existing_folder(service, subfolder_name, PARENT_ID)
    if root_id is None:
        root_id = find_or_create_folder(service, subfolder_name, PARENT_ID)

    # folder_cache: relative path tuple → Drive folder ID
    folder_cache: dict[tuple, str] = {(): root_id}

    # Cache of Drive files per folder: folder_id → {name: file_id}
    drive_files_cache: dict[str, dict] = {}

    def get_drive_files(folder_id: str) -> dict:
        if folder_id not in drive_files_cache:
            drive_files_cache[folder_id] = list_files_in_folder(service, folder_id)
        return drive_files_cache[folder_id]

    # Upload extension files
    for local_file in collect_extension_files():
        rel = local_file.relative_to(PROJECT_ROOT)
        parts = list(rel.parts)
        dir_parts = parts[:-1]
        filename = parts[-1]

        parent_folder_id = ensure_subfolder_tree(service, dir_parts, root_id, folder_cache)
        existing = get_drive_files(parent_folder_id)
        upload_file(service, local_file, filename, parent_folder_id, existing)
        existing[filename] = existing.get(filename, "__new__")

    print(f"\nDone. ({len(collect_extension_files())} files uploaded)")


if __name__ == "__main__":
    main()
