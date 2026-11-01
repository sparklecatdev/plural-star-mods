import importlib.util
import json
import os
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
        self.assertIn('/run/user/42/app/com.discordapp.Discord/discord-ipc-0', paths)
        self.assertIn('/run/user/42/snap.discord/discord-ipc-0', paths)
        self.assertIn('/custom/tmp/discord-ipc-0', paths)
        self.assertIn('/tmp/discord-ipc-9', paths)

    def test_activity(self):
        self.assertIsNone(companion.activity_for([]))
        self.assertEqual(companion.activity_for(['Alex'])['state'], 'Alex')
        self.assertEqual(len(companion.activity_for(['x' * 200])['state']), 128)

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
