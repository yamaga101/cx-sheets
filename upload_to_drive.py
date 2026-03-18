#!/usr/bin/env python3
"""
Upload Chrome extension dist/ to Google Drive (yamaga101).

Target: folder ID 19N3NGQundvR-gxaQsWBu71it-uVARn7B / subfolder "Sheets-Tab-Manager"
Rules:
  - Upload individual files (no zip)
  - Subfolder created if absent; reuse if present
  - Existing files overwritten; remote-only files left untouched
  - Mirrors the local dist/ directory tree exactly
"""

import os
import sys
import mimetypes
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ── Configuration ────────────────────────────────────────────────────────────

TOKEN_PATH    = os.path.expanduser("~/.config/google-api/token.json")
PARENT_ID     = "19N3NGQundvR-gxaQsWBu71it-uVARn7B"   # yamaga101 Drive parent folder
SUBFOLDER_NAME = "Sheets-Tab-Manager"
LOCAL_DIST    = Path(__file__).parent / "dist"

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

def main():
    if not LOCAL_DIST.exists():
        print(f"ERROR: dist/ not found at {LOCAL_DIST}", file=sys.stderr)
        sys.exit(1)

    service = get_service()

    # Ensure top-level "Sheets-Tab-Manager" subfolder
    root_id = find_or_create_folder(service, SUBFOLDER_NAME, PARENT_ID)

    # folder_cache: relative path tuple → Drive folder ID
    folder_cache: dict[tuple, str] = {(): root_id}

    # Cache of Drive files per folder: folder_id → {name: file_id}
    # Populated lazily.
    drive_files_cache: dict[str, dict] = {}

    def get_drive_files(folder_id: str) -> dict:
        if folder_id not in drive_files_cache:
            drive_files_cache[folder_id] = list_files_in_folder(service, folder_id)
        return drive_files_cache[folder_id]

    # Walk local dist/ tree
    for local_file in sorted(LOCAL_DIST.rglob("*")):
        if not local_file.is_file():
            continue

        rel = local_file.relative_to(LOCAL_DIST)
        parts = list(rel.parts)          # e.g. ['assets', 'index.css']
        dir_parts = parts[:-1]           # directory components
        filename = parts[-1]

        # Ensure Drive subfolder tree
        parent_folder_id = ensure_subfolder_tree(service, dir_parts, root_id, folder_cache)

        # Get existing files in this Drive folder
        existing = get_drive_files(parent_folder_id)

        # Upload (create or update)
        upload_file(service, local_file, filename, parent_folder_id, existing)

        # Update cache so next file in same folder sees it
        existing[filename] = existing.get(filename, "__new__")

    print("\nDone.")


if __name__ == "__main__":
    main()
