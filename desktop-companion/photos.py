"""Opt-in temporary hosting for Discord activity photos."""
import hashlib
import http.client
from io import BytesIO
import json
from pathlib import Path
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid

from PIL import Image, PngImagePlugin

UPLOAD_URL = 'https://uguu.se/upload'


def upload_context():
    context = ssl.create_default_context()
    # Bundled OpenSSL uses Ubuntu's paths, which are absent on some Linux distros.
    if sys.platform.startswith('linux') and not context.cert_store_stats()['x509_ca']:
        for path in ('/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt',
                     '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', '/etc/ssl/cert.pem'):
            if Path(path).is_file():
                try:
                    context.load_verify_locations(cafile=path)
                    break
                except OSError:
                    continue
    return context


def upload_error(error):
    if isinstance(error, urllib.error.HTTPError):
        if error.code == 429:
            return 'Uguu is rate limiting uploads (HTTP 429).'
        if error.code == 403:
            return 'Uguu refused the upload (HTTP 403). Check your VPN or proxy, or try another network.'
        return f'Uguu returned HTTP {error.code}.'
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, ssl.SSLCertVerificationError):
        return "Could not verify Uguu's HTTPS certificate. Check your system's CA certificates and clock."
    if isinstance(reason, socket.gaierror):
        return 'Could not resolve uguu.se. Check your connection or DNS.'
    if isinstance(reason, TimeoutError):
        return 'The photo upload to Uguu timed out.'
    if isinstance(reason, ssl.SSLError):
        return 'The HTTPS connection to Uguu failed.'
    if isinstance(error, ValueError):
        return str(error)
    return 'Could not reach Uguu. Check your connection, firewall or proxy.'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Photo host redirected the upload.')


class PhotoPublisher:
    def __init__(self):
        self.cache = {}
        self.retry_after = 0
        self.last_error = ''

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
            raise ValueError(self.last_error)
        try:
            with Image.open(BytesIO(raw)) as source:
                source.seek(0)
                source.thumbnail((512, 512))
                # A fresh image strips metadata and uses only the first animation frame.
                image = Image.new('RGBA', source.size)
                image.paste(source.convert('RGBA'))
        except (OSError, ValueError, Image.DecompressionBombError):
            raise ValueError('The profile photo could not be read as an image.') from None
        try:
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
            opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=upload_context()))
            with opener.open(request, timeout=20) as response:
                body = response.read(4097)
            if len(body) > 4096:
                raise ValueError('Photo host returned an oversized response.')
            try:
                result = json.loads(body)
            except (ValueError, UnicodeError):
                raise ValueError('Uguu returned an invalid response. Check whether your network blocks uguu.se.') from None
            if isinstance(result, dict) and result.get('success') is False:
                code = result.get('errorcode')
                detail = f' (code {code})' if type(code) is int else ''
                raise ValueError('Uguu rejected the photo' + detail + '.')
            files = result.get('files') if isinstance(result, dict) and result.get('success') is True else None
            url = files[0].get('url') if isinstance(files, list) and len(files) == 1 and isinstance(files[0], dict) else None
            if not isinstance(url, str) or not re.fullmatch(r'https://[a-z0-9-]+\.uguu\.se/[a-zA-Z0-9_-]{6,64}\.png', url):
                raise ValueError('Photo host did not return a valid image link.')
            self.cache[digest] = (url, now + 150 * 60)
            self.retry_after = 0
            self.last_error = ''
            return url
        except (OSError, ValueError, http.client.HTTPException) as error:
            self.retry_after = now + 5 * 60
            self.last_error = upload_error(error) + ' Retrying automatically; text presence is still active.'
            raise ValueError(self.last_error) from None
