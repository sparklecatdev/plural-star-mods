"""Read the Plural Star cloud vault and sync companion preferences."""
import base64
import gzip
import hashlib
import hmac
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from argon2.low_level import Type, hash_secret_raw
from nacl.exceptions import CryptoError
from nacl.secret import SecretBox

SALT = b'PluralStarCloudVault/v1'
DEFAULT_RELAY = 'http://pluralstar.dedyn.io:7523'
COMPANION_KEY = 'ps:sparklecat:discord-companion'


class ConflictError(ValueError):
    pass


def derive(password):
    material = hash_secret_raw(password.encode('utf-8'), SALT, 3, 65536, 1, 32, Type.ID)
    prk = hmac.new(SALT, material, hashlib.sha256).digest()
    def key(label):
        return hmac.new(prk, label + b'\x01', hashlib.sha256).digest()
    return key(b'lookup').hex(), key(b'auth').hex(), key(b'kek')


def device_id():
    base = Path(os.environ.get('APPDATA') or os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    folder = base / 'sparklecat-discord-companion'
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = folder / 'device-id'
    try:
        value = path.read_text().strip()
        if re.fullmatch(r'[a-f0-9]{10}', value):
            return value
    except FileNotFoundError:
        pass
    value = secrets.token_hex(5)
    path.write_text(value)
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('The cloud server redirected the request. Check the relay URL.')


class Cloud:
    def __init__(self, password, url=DEFAULT_RELAY, token=''):
        parsed = urllib.parse.urlsplit(url.strip())
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Enter a valid cloud relay URL.')
        self.url = url.strip().rstrip('/')
        self.token = token.strip()
        self.lookup, self.auth, self.kek = derive(password)
        self.id = device_id()
        self.device_key = ''
        self.master = None
        self.avatars = {}
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, method='GET', body=None, device=True, extra_headers=None):
        headers = {'X-Vault-Id': self.lookup, 'X-Vault-Auth': self.auth, 'User-Agent': 'Sparklecat-Discord-Companion'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        if device and self.device_key:
            headers.update({'X-Ps-Device-Id': self.id, 'X-Ps-Device-Key': self.device_key})
        headers.update(extra_headers or {})
        data = None
        if isinstance(body, bytes):
            data = body
        elif body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        request = urllib.request.Request(self.url + path, headers=headers, data=data, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                result = response.read(30 * 1024 * 1024 + 1)
                if len(result) > 30 * 1024 * 1024:
                    raise ValueError('Cloud response is too large.')
                return result
        except urllib.error.HTTPError as error:
            if error.code == 409:
                raise ConflictError('Cloud data changed during sync.') from error
            if error.code in (401, 403):
                self.master = None
                self.device_key = ''
            raise ValueError('Cloud server returned HTTP ' + str(error.code) + '. Check your password, relay and linked devices.') from error

    def json(self, path, method='GET', body=None, device=True):
        data = json.loads(self.request(path, method, body, device))
        if not isinstance(data, dict):
            raise ValueError('Unexpected response from cloud server.')
        return data

    def connect(self):
        creds = {'lookup_id': self.lookup, 'auth_secret': self.auth}
        registration = self.json('/cloud/vault/devices', 'POST', {**creds, 'sub_id': self.id, 'label': 'Sparklecat Discord Companion'}, False)
        self.device_key = registration.get('device_key', '')
        if not self.device_key:
            self.device_key = self.json('/cloud/vault/devices/' + self.id + '/key', 'POST', creds, False).get('device_key', '')
        if not isinstance(self.device_key, str) or not self.device_key:
            raise ValueError('Cloud server did not return a device key.')
        info = self.json('/cloud/vault/info')
        try:
            self.master = SecretBox(self.kek).decrypt(base64.b64decode(info['wrapped_master_key'], validate=True))
        except (KeyError, ValueError, CryptoError) as error:
            raise ValueError('Could not unlock the cloud vault. Check your password.') from error
        if len(self.master) != SecretBox.KEY_SIZE:
            raise ValueError('Invalid cloud vault key.')

    def read_manifest(self):
        if self.master is None:
            self.connect()
        response = self.json('/cloud/vault/manifest')
        try:
            data = json.loads(gzip.decompress(SecretBox(self.master).decrypt(base64.b64decode(response['ciphertext'], validate=True))))
            if not isinstance(data, dict) or data.get('v') != 1 or not isinstance(data.get('entries'), list):
                raise ValueError('Unsupported cloud manifest.')
            return response, data
        except (KeyError, TypeError, CryptoError, OSError) as error:
            raise ValueError('Could not read the encrypted cloud manifest.') from error

    def read_entry(self, manifest, path, default):
        entry = next((e for e in manifest['entries'] if isinstance(e, dict) and e.get('path') == path), None)
        if entry is None:
            return default
        object_id = entry.get('id')
        if not isinstance(object_id, str) or not re.fullmatch(r'[0-9a-f]{64}', object_id):
            raise ValueError('Invalid cloud object ID.')
        ciphertext = self.request('/cloud/vault/objects/' + object_id)
        if hashlib.blake2b(ciphertext, digest_size=32).hexdigest() != object_id:
            raise ValueError('Cloud object failed its integrity check.')
        try:
            return json.loads(gzip.decompress(SecretBox(self.master).decrypt(ciphertext)))
        except (CryptoError, OSError, ValueError) as error:
            raise ValueError('Could not read encrypted cloud data.') from error

    def get_front(self):
        return list(dict.fromkeys(member['name'] for member in self.get_front_members()))

    def get_front_members(self, include_avatars=False):
        _, manifest = self.read_manifest()
        members = front_members(self.read_entry(manifest, 'ps:members', []), self.read_entry(manifest, 'ps:front', None))
        if include_avatars:
            for member in members:
                try:
                    member['photo'] = self.get_avatar(manifest, member)
                except (OSError, ValueError, CryptoError):
                    member['photo_error'] = 'Could not load this photo. Try syncing Plural Star and loading again.'
        return members

    def get_avatar(self, manifest, member):
        avatar = member['avatar']
        entry = next((e for e in manifest['entries'] if isinstance(e, dict) and e.get('path') == 'ps:media:av:' + member['id']), None)
        if avatar.startswith('data:image/'):
            if len(avatar) > 40 * 1024 * 1024 or ';base64,' not in avatar:
                raise ValueError('Invalid photo data.')
            return base64.b64decode(avatar.split(';base64,', 1)[1], validate=True)
        parsed = urllib.parse.urlsplit(avatar)
        if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
            if avatar not in self.avatars:
                # Public photos must never receive cloud credentials.
                request = urllib.request.Request(avatar, headers={'User-Agent': 'Sparklecat-Discord-Companion'})
                with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
                    photo = response.read(30 * 1024 * 1024 + 1)
                    if len(photo) > 30 * 1024 * 1024:
                        raise ValueError('Photo is too large.')
                    self.avatars[avatar] = photo
            return self.avatars[avatar]
        if not entry:
            if avatar:
                raise ValueError('Photo has not been synced to the cloud.')
            return None
        object_id = entry.get('id')
        if not isinstance(object_id, str) or not re.fullmatch(r'[0-9a-f]{64}', object_id):
            raise ValueError('Invalid cloud photo ID.')
        if object_id not in self.avatars:
            ciphertext = self.request('/cloud/vault/objects/' + object_id)
            if hashlib.blake2b(ciphertext, digest_size=32).hexdigest() != object_id:
                raise ValueError('Cloud photo failed its integrity check.')
            self.avatars[object_id] = SecretBox(self.master).decrypt(ciphertext)
        return self.avatars[object_id]

    def get_companion_settings(self):
        _, manifest = self.read_manifest()
        return self.read_entry(manifest, COMPANION_KEY, None)

    def put_companion_settings(self, settings):
        # The vault's compare-and-swap version prevents overwriting unrelated changes.
        raw = json.dumps(settings, ensure_ascii=True, separators=(',', ':'))
        plain = gzip.compress(raw.encode('utf-8'))
        ciphertext = bytes(SecretBox(self.master).encrypt(plain))
        object_id = hashlib.blake2b(ciphertext, digest_size=32).hexdigest()
        # The relay accepts one complete chunk for this bounded record.
        self.request('/cloud/vault/objects/' + object_id, 'PUT', ciphertext, extra_headers={
            'Content-Type': 'application/octet-stream', 'Content-Range': f'bytes 0-{len(ciphertext)-1}/{len(ciphertext)}', 'X-Ps-Tier': 'base'})
        h = 0x811c9dc5
        encoded = raw.encode('utf-16-le')
        for unit in (int.from_bytes(encoded[i:i+2], 'little') for i in range(0, len(encoded), 2)):
            h = ((h ^ unit) * 0x01000193) & 0xffffffff
        entry = {'path': COMPANION_KEY, 'id': object_id, 'size': len(plain), 'kind': 'data', 'tier': 'base', 'hash': format(h, 'x')}
        for _ in range(3):
            response, manifest = self.read_manifest()
            version = int(response.get('version', 0))
            entries = [e for e in manifest['entries'] if e.get('path') != COMPANION_KEY]
            entries.append(entry)
            manifest.update(entries=entries, version=version + 1, updated=int(__import__('time').time() * 1000))
            sealed = bytes(SecretBox(self.master).encrypt(gzip.compress(json.dumps(manifest, separators=(',', ':')).encode())))
            refs = [{'id': e['id'], 'tier': e['tier'], 'size': e['size']} for e in entries]
            try:
                self.json('/cloud/vault/manifest', 'PUT', {'expected_version': version, 'ciphertext': base64.b64encode(sealed).decode(), 'objects': refs})
                return
            except ConflictError:
                continue
        raise ConflictError('Could not sync settings because the cloud is changing. Try again.')


def front_members(members, front):
    if not isinstance(members, list) or (front is not None and not isinstance(front, dict)):
        raise ValueError('Unexpected member or front data in the cloud.')
    records = {m.get('id'): m for m in members
             if isinstance(m, dict) and isinstance(m.get('id'), str) and isinstance(m.get('name'), str)
             and not m.get('deleted') and not m.get('archived')}
    if not front:
        return []
    ids = []
    for tier in ('primary', 'coFront'):
        value = front.get(tier, {})
        if isinstance(value, dict) and isinstance(value.get('memberIds', []), list):
            ids.extend(value.get('memberIds', []))
    result = []
    seen = set()
    for member_id in ids:
        if not isinstance(member_id, str) or member_id not in records or member_id in seen:
            continue
        seen.add(member_id)
        member = records[member_id]
        name = member['name'].strip()
        if name:
            result.append({'id': member_id, 'name': name,
                           'pronouns': member.get('pronouns', '') if isinstance(member.get('pronouns'), str) else '',
                           'avatar': member.get('avatar', '') if isinstance(member.get('avatar'), str) else ''})
    return result


def front_names(members, front):
    return list(dict.fromkeys(member['name'] for member in front_members(members, front)))
