import base64
import gzip
import hashlib
import json
from io import BytesIO
from PIL import Image
import unittest
from unittest import mock

from argon2.low_level import Type, hash_secret_raw
from nacl.secret import SecretBox
import cloud


def seal(key, data):
    return bytes(SecretBox(key).encrypt(data))


class CloudTests(unittest.TestCase):
    def test_upstream_argon2_vector(self):
        value = hash_secret_raw('Plural Star vault check ✦ 2026'.encode(), cloud.SALT, 3, 65536, 1, 32, Type.ID)
        self.assertEqual(value.hex(), 'bab91b985a030977df4e9a9eb2b616bb1e70a54e82f346d2e568b8c6583c3f11')

    def test_encrypted_cloud_read(self):
        master = bytes(range(32))
        password = 'test password'
        lookup, auth, kek = cloud.derive(password)
        def packed(value):
            return seal(master, gzip.compress(json.dumps(value).encode()))
        members = packed([{'id': 'a', 'name': 'Alex'}, {'id': 'b', 'name': 'Bee'}])
        front = packed({'primary': {'memberIds': ['a']}, 'coFront': {'memberIds': ['b']}, 'coConscious': {'memberIds': ['a']}})
        objects = {hashlib.blake2b(obj, digest_size=32).hexdigest(): obj for obj in (members, front)}
        manifest = packed({'v': 1, 'entries': [{'path': path, 'id': obj_id} for path, obj_id in zip(('ps:members', 'ps:front'), objects)]})
        with mock.patch.object(cloud, 'device_id', return_value='abc1234567'):
            client = cloud.Cloud(password, 'https://example.com')
        calls = []
        def request(path, method='GET', body=None, device=True):
            calls.append((path, method, body, device))
            if path == '/cloud/vault/devices':
                self.assertEqual(body['lookup_id'], lookup)
                self.assertEqual(body['auth_secret'], auth)
                return json.dumps({'device_key': 'device-key'}).encode()
            if path == '/cloud/vault/info':
                return json.dumps({'wrapped_master_key': base64.b64encode(seal(kek, master)).decode()}).encode()
            if path == '/cloud/vault/manifest':
                return json.dumps({'ciphertext': base64.b64encode(manifest).decode()}).encode()
            return objects[path.rsplit('/', 1)[1]]
        client.request = request
        self.assertEqual(client.get_front(), ['Alex', 'Bee'])
        self.assertEqual(client.get_front(), ['Alex', 'Bee'])
        self.assertEqual(sum(path == '/cloud/vault/devices' for path, *_ in calls), 1)
        self.assertTrue(all(method in ('GET', 'POST') for _, method, *_ in calls))

    def test_names_and_invalid_url(self):
        self.assertEqual(cloud.front_names([{'id': 'a', 'name': 'Alex'}, {'id': 'b', 'name': 'Bee', 'archived': True}], {'primary': {'memberIds': ['a', 'b', 'a']}}), ['Alex'])
        with self.assertRaises(ValueError):
            cloud.Cloud('password', 'https://example.com@evil.test')

    def test_front_members_and_encrypted_avatar(self):
        master = bytes(range(32))
        photo = BytesIO()
        Image.new('RGB', (96, 96), 'blue').save(photo, format='PNG')
        ciphertext = seal(master, photo.getvalue())
        object_id = hashlib.blake2b(ciphertext, digest_size=32).hexdigest()
        manifest = {'entries': [{'path': 'ps:media:av:a', 'id': object_id}]}
        with mock.patch.object(cloud, 'device_id', return_value='abc1234567'):
            client = cloud.Cloud('password', 'https://example.com')
        client.master = master
        client.read_manifest = lambda: ({}, manifest)
        client.read_entry = lambda _, path, default: ([{'id': 'a', 'name': 'Alex', 'pronouns': 'they/them', 'avatar': 'cloud:media'}] if path == 'ps:members' else {'primary': {'memberIds': ['a', 'a']}})
        client.request = mock.Mock(return_value=ciphertext)
        expected = [{'id': 'a', 'name': 'Alex', 'pronouns': 'they/them', 'avatar': 'cloud:media', 'photo': photo.getvalue()}]
        self.assertEqual(client.get_front_members(include_avatars=True), expected)
        self.assertEqual(client.get_front_members(include_avatars=True), expected)
        client.request.assert_called_once()

    def test_public_and_inline_avatars(self):
        photo = BytesIO()
        Image.new('RGB', (96, 96), 'blue').save(photo, format='PNG')
        data = photo.getvalue()
        with mock.patch.object(cloud, 'device_id', return_value='abc1234567'):
            client = cloud.Cloud('password', 'https://example.com', 'private-token')
        client.read_manifest = lambda: ({}, {'entries': []})
        members = [{'id': 'a', 'name': 'Alex', 'avatar': 'https://images.example.com/alex.png'},
                   {'id': 'b', 'name': 'Bee', 'avatar': 'data:image/png;base64,' + base64.b64encode(data).decode()}]
        client.read_entry = lambda _, path, default: members if path == 'ps:members' else {'primary': {'memberIds': ['a', 'b']}}
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = data
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.object(cloud.urllib.request, 'build_opener', return_value=opener):
            loaded = client.get_front_members(include_avatars=True)
            self.assertEqual([m['photo'] for m in loaded], [data, data])
            self.assertEqual(Image.open(BytesIO(loaded[0]['photo'])).size, (96, 96))
            client.get_front_members(include_avatars=True)
        opener.open.assert_called_once()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, members[0]['avatar'])
        self.assertEqual(dict(request.header_items()), {'User-agent': 'Sparklecat-Discord-Companion'})

    def test_avatar_failure_keeps_fronting_data_and_reports_error(self):
        with mock.patch.object(cloud, 'device_id', return_value='abc1234567'):
            client = cloud.Cloud('password', 'https://example.com')
        client.master = bytes(range(32))
        client.read_manifest = lambda: ({}, {'entries': [{'path': 'ps:media:av:a', 'id': 'a' * 64}]})
        client.read_entry = lambda _, path, default: [{'id': 'a', 'name': 'Alex', 'avatar': 'cloud:media'}] if path == 'ps:members' else {'primary': {'memberIds': ['a']}}
        client.request = mock.Mock(return_value=b'damaged')
        member = client.get_front_members(include_avatars=True)[0]
        self.assertEqual(member['name'], 'Alex')
        self.assertNotIn('photo', member)
        self.assertIn('photo_error', member)
        self.assertEqual(client.avatars, {})

    def test_settings_write_retries_without_losing_other_entries(self):
        master = bytes(range(32))
        with mock.patch.object(cloud, 'device_id', return_value='abc1234567'):
            client = cloud.Cloud('password', 'https://example.com')
        client.master = master
        other = {'path': 'ps:members', 'id': 'a' * 64, 'tier': 'base', 'size': 7, 'hash': 'old', 'kind': 'data'}
        added = {'path': 'ps:front', 'id': 'b' * 64, 'tier': 'base', 'size': 5, 'hash': 'new', 'kind': 'data'}
        state = {'version': 1, 'manifest': {'v': 1, 'version': 1, 'entries': [other]}, 'objects': {}, 'conflict': True}

        def request(path, method='GET', body=None, device=True, extra_headers=None):
            if path.startswith('/cloud/vault/objects/'):
                object_id = path.rsplit('/', 1)[1]
                if method == 'PUT':
                    self.assertEqual(hashlib.blake2b(body, digest_size=32).hexdigest(), object_id)
                    self.assertEqual(extra_headers['Content-Range'], f'bytes 0-{len(body)-1}/{len(body)}')
                    state['objects'][object_id] = body
                    return b'{}'
                return state['objects'][object_id]
            if method == 'GET':
                packed = seal(master, gzip.compress(json.dumps(state['manifest']).encode()))
                return json.dumps({'version': state['version'], 'ciphertext': base64.b64encode(packed).decode()}).encode()
            if state['conflict']:
                state['conflict'] = False
                state['version'] += 1
                state['manifest']['entries'].append(added)
                raise cloud.ConflictError('concurrent update')
            self.assertEqual(body['expected_version'], state['version'])
            state['version'] += 1
            state['manifest'] = json.loads(gzip.decompress(SecretBox(master).decrypt(base64.b64decode(body['ciphertext']))))
            self.assertEqual(len(body['objects']), 3)
            return b'{}'

        client.request = request
        value = {'v': 1, 'title': 'Hello ✦', 'icon': '', 'autostart': True, 'close_mode': 'tray'}
        client.put_companion_settings(value)
        self.assertEqual(client.get_companion_settings(), value)
        self.assertEqual([entry['path'] for entry in state['manifest']['entries']], ['ps:members', 'ps:front', cloud.COMPANION_KEY])
        entry = state['manifest']['entries'][-1]
        raw = gzip.decompress(SecretBox(master).decrypt(state['objects'][entry['id']])).decode()
        h = 0x811c9dc5
        for ch in raw:
            h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
        self.assertEqual(entry['hash'], format(h, 'x'))


if __name__ == '__main__':
    unittest.main()
