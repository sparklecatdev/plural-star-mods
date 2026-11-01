"""Opt-in temporary hosting for Discord activity photos."""
import hashlib
from io import BytesIO
import json
import re
import time
import urllib.request
import uuid

from PIL import Image, PngImagePlugin

UPLOAD_URL = 'https://uguu.se/upload'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Photo host redirected the upload.')


class PhotoPublisher:
    def __init__(self):
        self.cache = {}
        self.retry_after = 0

    def for_activity(self, members, presence, enabled):
        if not enabled or not members or not any('{avatar}' in presence.get(key, '') for key in ('large_image', 'small_image')):
            return members
        first = members[0]
        if first.get('avatar', '').startswith('https://'):
            return members
        if not first.get('photo'):
            raise ValueError('The first fronter has no available photo. Sync Plural Star and try again.')
        return [{**first, 'avatar': self.publish(first['photo'])}, *members[1:]]

    def publish(self, raw):
        if not isinstance(raw, bytes) or len(raw) > 30 * 1024 * 1024:
            raise ValueError('Invalid profile photo.')
        digest = hashlib.sha256(raw).digest()
        now = time.monotonic()
        self.cache = {key: item for key, item in self.cache.items() if item[1] > now}
        if digest in self.cache:
            return self.cache[digest][0]
        if now < self.retry_after:
            raise ValueError('Photo upload failed; retrying in a few minutes.')
        try:
            with Image.open(BytesIO(raw)) as source:
                source.seek(0)
                source.thumbnail((512, 512))
                # A fresh image strips metadata and uses only the first animation frame.
                image = Image.new('RGBA', source.size)
                image.paste(source.convert('RGBA'))
            encoded = BytesIO()
            info = PngImagePlugin.PngInfo()
            # Distinct uploads prevent host deduplication from returning an expiring link.
            info.add_text('Upload', uuid.uuid4().hex)
            image.save(encoded, format='PNG', pnginfo=info)
            boundary = uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
                    + encoded.getvalue() + f'\r\n--{boundary}--\r\n'.encode())
            request = urllib.request.Request(UPLOAD_URL, data=body, headers={
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'User-Agent': 'Sparklecat-Discord-Companion'})
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
                body = response.read(4097)
            if len(body) > 4096:
                raise ValueError('Photo host returned an oversized response.')
            result = json.loads(body)
            files = result.get('files') if isinstance(result, dict) and result.get('success') is True else None
            url = files[0].get('url') if isinstance(files, list) and len(files) == 1 and isinstance(files[0], dict) else None
            if not isinstance(url, str) or not re.fullmatch(r'https://[a-z0-9-]+\.uguu\.se/[a-zA-Z0-9_-]{6,64}\.png', url):
                raise ValueError('Photo host did not return a valid image link.')
            self.cache[digest] = (url, now + 150 * 60)
            self.retry_after = 0
            return url
        except (OSError, ValueError, Image.DecompressionBombError):
            self.retry_after = now + 5 * 60
            raise ValueError('Could not upload the Discord photo. Retrying automatically; text presence is still active.') from None
