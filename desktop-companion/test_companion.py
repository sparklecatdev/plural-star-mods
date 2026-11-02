import importlib.util
import json
import os
import queue
import socket
import struct
import tempfile
import threading
import unittest
from unittest import mock
from pathlib import Path

spec = importlib.util.spec_from_file_location('companion', Path(__file__).with_name('companion.py'))
companion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(companion)


class CompanionTests(unittest.TestCase):
    def test_discord_socket_paths_include_sandboxed_and_fallback_locations(self):
        with mock.patch.dict(os.environ, {'XDG_RUNTIME_DIR': '/run/user/42', 'TMPDIR': '/custom/tmp'}, clear=True):
            paths = companion.discord_socket_paths()
        self.assertIn(os.path.join('/run/user/42', 'app', 'com.discordapp.Discord', 'discord-ipc-0'), paths)
        self.assertIn(os.path.join('/run/user/42', 'snap.discord', 'discord-ipc-0'), paths)
        self.assertIn(os.path.join('/custom/tmp', 'discord-ipc-0'), paths)
        self.assertIn(os.path.join('/tmp', 'discord-ipc-9'), paths)

    def test_activity(self):
        self.assertIsNone(companion.activity_for([]))
        self.assertEqual(companion.activity_for(['Alex'])['state'], 'Alex')
        self.assertEqual(len(companion.activity_for(['x' * 200])['state']), 128)

    def test_custom_presence_and_empty_front(self):
        options = {'details': 'Front: {fronters}', 'state': '{count} here',
                   'large_image': 'https://example.com/image.png',
                   'button1_label': 'Site', 'button1_url': 'https://example.com',
                   'button2_label': 'Bad', 'button2_url': 'javascript:alert(1)', 'show_empty': True}
        activity = companion.activity_for(['Alex', 'Sam'], options)
        self.assertEqual(activity['details'], 'Front: Alex, Sam')
        self.assertEqual(activity['state'], '2 here')
        self.assertEqual(activity['assets']['large_image'], options['large_image'])
        self.assertEqual(activity['buttons'], [{'label': 'Site', 'url': 'https://example.com'}])
        self.assertEqual(companion.activity_for([], options)['details'], 'Front: Nobody')
        self.assertEqual(companion.clean_presence({'details': 3})['details'], 'Currently fronting')

    def test_real_fronter_templates(self):
        members = [{'name': 'Alex', 'pronouns': 'they/them', 'avatar': 'https://example.com/avatar.png'},
                   {'name': 'Sam', 'pronouns': 'she/her', 'avatar': 'cloud:media'}]
        options = {'details': '{name} ({pronouns})', 'state': '{fronters}: {count}', 'large_image': '{avatar}'}
        activity = companion.activity_for(members, options)
        self.assertEqual(activity['details'], 'Alex (they/them)')
        self.assertEqual(activity['state'], 'Alex, Sam: 2')
        self.assertEqual(activity['assets']['large_image'], 'https://example.com/avatar.png')
        self.assertNotIn('assets', companion.activity_for(members[1:], options))

    def test_worker_sends_hosted_photo_and_preserves_text_on_upload_failure(self):
        original = [{'name': 'Alex', 'avatar': 'cloud:photo', 'photo': b'private photo'}]
        hosted = [{**original[0], 'avatar': 'https://n.uguu.se/abcdefgh.png'}]
        for result in (hosted, ValueError('Upload unavailable')):
            with self.subTest(result=result), mock.patch.object(companion, 'Cloud') as cloud, \
                    mock.patch.object(companion, 'Discord') as discord, \
                    mock.patch.object(companion, 'PhotoPublisher') as photos:
                cloud.return_value.get_front_members.return_value = original
                if isinstance(result, Exception):
                    photos.return_value.for_activity.side_effect = result
                else:
                    photos.return_value.for_activity.return_value = result
                stop = mock.Mock()
                stop.is_set.side_effect = [False, True]
                sharing = threading.Event()
                sharing.set()
                messages = queue.Queue()
                companion.run_worker('password', 'relay', '', stop, messages, queue.Queue(),
                                     threading.Event(), {'presence': {'large_image': '{avatar}'}}, sharing)
                self.assertEqual(messages.get_nowait(), ('front', original))
                status = messages.get_nowait()
                activity = discord.return_value.set_activity.call_args_list[0].args[0]
                self.assertEqual(activity['state'], 'Alex')
                if isinstance(result, Exception):
                    self.assertNotIn('assets', activity)
                    self.assertIn('Upload unavailable', status)
                else:
                    self.assertEqual(activity['assets']['large_image'], hosted[0]['avatar'])
                self.assertTrue(photos.return_value.for_activity.call_args.args[2])

    def test_game_process_matching(self):
        with mock.patch.object(companion.os, 'name', 'posix'), \
                mock.patch.object(companion.subprocess, 'check_output', return_value='/usr/bin/other\n/home/user/MyGame\n'):
            self.assertTrue(companion.running_game('another, mygame'))
            self.assertFalse(companion.running_game('another'))
            self.assertFalse(companion.running_game(''))

    def test_worker_pauses_and_resumes_for_selected_game(self):
        with mock.patch.object(companion, 'Cloud') as cloud, \
                mock.patch.object(companion, 'Discord') as discord, \
                mock.patch.object(companion, 'PhotoPublisher') as photos, \
                mock.patch.object(companion, 'running_game', side_effect=[True, False]):
            cloud.return_value.get_front_members.return_value = [{'name': 'Alex'}]
            photos.return_value.for_activity.return_value = [{'name': 'Alex'}]
            stop = mock.Mock()
            stop.is_set.side_effect = [False, False, True]
            companion.run_worker('password', 'relay', '', stop, queue.Queue(), queue.Queue(),
                                 threading.Event(), {}, threading.Event(), {'enabled': True, 'names': 'game'})
            calls = discord.return_value.set_activity.call_args_list
            self.assertIsNone(calls[0].args[0])
            self.assertEqual(calls[1].args[0]['state'], 'Alex')
            self.assertEqual(photos.return_value.for_activity.call_count, 1)

    @unittest.skipIf(os.name == 'nt', 'Unix socket test')
    def test_discord_handshake_activity_and_clear(self):
        with tempfile.TemporaryDirectory() as directory:
            server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server.bind(os.path.join(directory, 'discord-ipc-0'))
            server.listen(1)
            received = []
            def serve():
                connection, _ = server.accept()
                with connection:
                    def read(size):
                        data = b''
                        while len(data) < size:
                            data += connection.recv(size - len(data))
                        return data
                    def exchange(response):
                        opcode, length = struct.unpack('<II', read(8))
                        request = json.loads(read(length))
                        received.append((opcode, request))
                        body = json.dumps(response(request)).encode()
                        connection.sendall(struct.pack('<II', 1, len(body)) + body)
                    exchange(lambda _: {'evt': 'READY'})
                    for _ in range(2):
                        exchange(lambda req: {'nonce': req['nonce'], 'cmd': 'SET_ACTIVITY'})
            thread = threading.Thread(target=serve, daemon=True)
            thread.start()
            with mock.patch.dict(os.environ, {'XDG_RUNTIME_DIR': directory}):
                discord = companion.Discord()
                discord.connect()
                discord.set_activity(companion.activity_for(['Alex']))
                discord.set_activity(None)
                discord.close()
            thread.join(2)
            server.close()
            self.assertEqual(received[0][1]['client_id'], companion.CLIENT_ID)
            self.assertEqual(received[1][1]['args']['activity']['state'], 'Alex')
            self.assertIsNone(received[2][1]['args']['activity'])


if __name__ == '__main__':
    unittest.main()
