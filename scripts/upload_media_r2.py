"""Copy web media to R2; preserve source files and refuse conflicting objects."""
import hashlib
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import ClientError

BUCKET = "mrfiesta-media"
PUBLIC = "https://pub-ceb0ec49c5c347e5acbcedf277f49d2d.r2.dev"
EXTENSIONS = {".mp4", ".webm", ".mov", ".mp3", ".m4a", ".ogg", ".wav", ".aac"}
ROOT = Path(__file__).resolve().parents[1]


def digest_stream(stream):
    digest = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        digest.update(chunk)
    return digest.hexdigest()


def main():
    endpoint = os.environ["R2_ENDPOINT"].rstrip("/")
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".r2.cloudflarestorage.com"):
        raise ValueError("R2_ENDPOINT must be the HTTPS S3 endpoint shown by Cloudflare")
    client = boto3.client(
        "s3", endpoint_url=endpoint, region_name="auto",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )
    paths = sorted(
        p for p in ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONS
        and not any(part in {".git", "node_modules", ".venv"} for part in p.relative_to(ROOT).parts)
    )
    if not paths:
        raise RuntimeError("No media found")
    manifest = []
    for path in paths:
        relative = path.relative_to(ROOT).as_posix()
        key = "github-pages/" + relative
        size = path.stat().st_size
        with path.open("rb") as stream:
            checksum = digest_stream(stream)
        try:
            head = client.head_object(Bucket=BUCKET, Key=key)
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) not in {"404", "NoSuchKey", "NotFound"}:
                raise
            head = None
        if head is not None:
            if head["ContentLength"] != size or head.get("Metadata", {}).get("sha256") != checksum:
                raise RuntimeError("Conflicting destination object; refusing overwrite: " + key)
        else:
            client.upload_file(
                str(path), BUCKET, key,
                ExtraArgs={
                    "ContentType": mimetypes.guess_type(relative)[0] or "application/octet-stream",
                    "CacheControl": "public, max-age=3600",
                    "Metadata": {"sha256": checksum},
                },
            )
        response = client.get_object(Bucket=BUCKET, Key=key)
        with response["Body"] as stream:
            if digest_stream(stream) != checksum:
                raise RuntimeError("R2 verification failed: " + key)
        public_url = PUBLIC + "/" + quote(key, safe="/")
        with urlopen(Request(public_url, method="HEAD", headers={"User-Agent": "Mozilla/5.0 (compatible; MrFiestaMediaCheck/1.0)"}), timeout=60) as response:
            if int(response.headers.get("Content-Length", "-1")) != size:
                raise RuntimeError("Public URL verification failed: " + key)
        manifest.append({"source": relative, "url": public_url, "bytes": size, "sha256": checksum})
        print("Verified:", relative, f"({size / 1e6:.2f} MB)", flush=True)
    report = ROOT / "r2-upload-manifest.json"
    report.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = f"Copied and verified {len(manifest)} media files ({sum(x['bytes'] for x in manifest)/1e6:.2f} MB). Source files and page links are unchanged.\n"
    print(summary)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(summary)


if __name__ == "__main__":
    main()
