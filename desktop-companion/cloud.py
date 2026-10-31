"""Read the Plural Star cloud vault without changing its data."""
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
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, method='GET', body=None, device=True):
        headers = {'X-Vault-Id': self.lookup, 'X-Vault-Auth': self.auth, 'User-Agent': 'Sparklecat-Discord-Companion'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        if device and self.device_key:
            headers.update({'X-Ps-Device-Id': self.id, 'X-Ps-Device-Key': self.device_key})
        data = None
        if body is not None:
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

    def get_front(self):
        if self.master is None:
            self.connect()
        try:
            manifest = self.json('/cloud/vault/manifest')
            plain = SecretBox(self.master).decrypt(base64.b64decode(manifest['ciphertext'], validate=True))
            data = json.loads(gzip.decompress(plain))
            if not isinstance(data, dict) or data.get('v') != 1 or not isinstance(data.get('entries'), list):
                raise ValueError('Unsupported cloud manifest.')
            entries = {e.get('path'): e.get('id') for e in data['entries'] if isinstance(e, dict)}
            def read(path, default):
                object_id = entries.get(path)
                if object_id is None:
                    return default
                if not isinstance(object_id, str) or not re.fullmatch(r'[0-9a-f]{64}', object_id):
                    raise ValueError('Invalid cloud object ID.')
                ciphertext = self.request('/cloud/vault/objects/' + object_id)
                if hashlib.blake2b(ciphertext, digest_size=32).hexdigest() != object_id:
                    raise ValueError('Cloud object failed its integrity check.')
                return json.loads(gzip.decompress(SecretBox(self.master).decrypt(ciphertext)))
            return front_names(read('ps:members', []), read('ps:front', None))
        except (KeyError, TypeError, CryptoError, OSError) as error:
            raise ValueError('Could not read the encrypted cloud data.') from error


def front_names(members, front):
    if not isinstance(members, list) or (front is not None and not isinstance(front, dict)):
        raise ValueError('Unexpected member or front data in the cloud.')
    names = {m.get('id'): m.get('name', '').strip() for m in members
             if isinstance(m, dict) and isinstance(m.get('id'), str) and isinstance(m.get('name'), str)
             and not m.get('deleted') and not m.get('archived')}
    if not front:
        return []
    ids = []
    for tier in ('primary', 'coFront'):
        value = front.get(tier, {})
        if isinstance(value, dict) and isinstance(value.get('memberIds', []), list):
            ids.extend(value.get('memberIds', []))
    return list(dict.fromkeys(names[x] for x in ids if isinstance(x, str) and names.get(x)))
