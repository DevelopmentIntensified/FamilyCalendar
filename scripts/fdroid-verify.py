"""Verify a freshly built F-Droid repo the way the client does, then emit the
site's public files (issue #287). Run by scripts/fdroid-publish.sh with the
fdroidserver interpreter; never touches key material.

Checks:
  * entry.jar (index v2) is signed exactly once by the key whose SHA-256 is
    --fingerprint, and entry.json's index-v2.json sha256 matches the file;
  * index-v1.jar (older clients) is signed by the same key;
  * the new APK is listed in index-v2 with a matching sha256;
  * every APK in the repo has the same signer (else updates break).
Writes --published-json (fingerprint + latest APK) and --qr-svg (add-repo link).
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone

import qrcode
import qrcode.image.svg
from fdroidserver import common, index

APP_ID = 'com.familyplanz.app'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def fail(msg):
    print(f'fdroid-verify: FAIL: {msg}', file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--fingerprint', required=True)
    ap.add_argument('--apk', required=True, help='file name of the new APK in --repo')
    ap.add_argument('--repo-url', required=True)
    ap.add_argument('--published-json', required=True)
    ap.add_argument('--qr-svg', required=True)
    ap.add_argument('--allow-mixed-signers', action='store_true', help='dry runs only')
    args = ap.parse_args()

    fp = args.fingerprint.upper()
    common.config = {'jarsigner': shutil.which('jarsigner') or 'jarsigner'}

    try:
        entry, _key, entry_fp = index.get_index_from_jar(
            os.path.join(args.repo, 'entry.jar'), fingerprint=fp
        )
        _v1, _key1, v1_fp = index.get_index_from_jar(
            os.path.join(args.repo, 'index-v1.jar'), fingerprint=fp, allow_deprecated=True
        )
    except index.VerificationException as e:
        fail(str(e))
    print(f'fdroid-verify: entry.jar signed, fingerprint {entry_fp}')
    print(f'fdroid-verify: index-v1.jar signed, fingerprint {v1_fp}')

    v2_meta = entry['index']
    v2_path = os.path.join(args.repo, v2_meta['name'].lstrip('/'))
    if sha256(v2_path) != v2_meta['sha256']:
        fail('index-v2.json sha256 does not match entry.json')
    print('fdroid-verify: index-v2.json sha256 matches entry.json')

    with open(v2_path) as f:
        v2 = json.load(f)
    versions = v2.get('packages', {}).get(APP_ID, {}).get('versions', {})
    apk_path = os.path.join(args.repo, args.apk)
    apk_sha = sha256(apk_path)
    listed = [v for v in versions.values() if v['file']['name'].lstrip('/') == args.apk]
    if not listed:
        fail(f'{args.apk} is not listed in index-v2.json')
    if listed[0]['file']['sha256'] != apk_sha:
        fail(f'{args.apk} sha256 differs from index-v2.json')
    manifest = listed[0]['manifest']
    signers = {tuple(v['manifest'].get('signer', {}).get('sha256', [])) for v in versions.values()}
    if len(signers) != 1:
        msg = f'APKs in the repo have {len(signers)} different signers; clients cannot update across them'
        if not args.allow_mixed_signers:
            fail(msg)
        print(f'fdroid-verify: WARNING: {msg} (dry run)')
    else:
        print(f'fdroid-verify: all {len(versions)} APK(s) share one signer')
    print(
        f"fdroid-verify: {args.apk} listed (versionName {manifest['versionName']}, "
        f"versionCode {manifest['versionCode']}, {len(versions)} version(s) in repo)"
    )

    published = {
        'fingerprint': fp,
        'repoUrl': args.repo_url,
        'latest': {
            'apk': args.apk,
            'versionName': manifest['versionName'],
            'versionCode': manifest['versionCode'],
            'sha256': apk_sha,
            'size': os.path.getsize(apk_path),
            'publishedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        },
    }
    with open(args.published_json, 'w') as f:
        json.dump(published, f, indent='\t')
        f.write('\n')

    host_path = args.repo_url.split('://', 1)[1]
    link = f'fdroidrepos://{host_path}?fingerprint={fp}'
    qrcode.make(link, image_factory=qrcode.image.svg.SvgPathImage, border=2).save(args.qr_svg)
    print(f'fdroid-verify: QR for {link}')


if __name__ == '__main__':
    main()
