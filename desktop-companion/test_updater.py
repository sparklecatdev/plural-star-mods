import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

import updater


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class UpdateTests(unittest.TestCase):
    def responses(self, archive, digest=None):
        asset = {'name': 'sparklecat-discord-companion-windows-x64.zip',
                 'browser_download_url': 'https://github.com/sparklecatdev/plural-star-mods/releases/download/desktop-v9.0.0/build.zip',
                 'digest': digest or 'sha256:' + hashlib.sha256(archive).hexdigest()}
        releases = [{'tag_name': 'desktop-v9.0.0', 'assets': [asset]}]
        return [Response(json.dumps(releases).encode()), Response(archive)]

    def archive(self, name=None):
        if name is None:
            name = 'Sparklecat-Discord-Companion/Sparklecat-Discord-Companion' + ('.exe' if os.name == 'nt' else '')
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as z:
            z.writestr(name, b'executable')
        return output.getvalue()

    @patch('updater.sys.platform', 'linux')
    @patch('updater.platform_asset', return_value='windows-x64.zip')
    def test_download_and_verify(self, _):
        with patch('updater.urllib.request.urlopen', side_effect=self.responses(self.archive())):
            result = updater.fetch_update()
        self.assertTrue(result[2].is_file())
        import shutil
        shutil.rmtree(result[0])

    @patch('updater.platform_asset', return_value='windows-x64.zip')
    def test_reject_bad_digest_and_traversal(self, _):
        with patch('updater.urllib.request.urlopen', side_effect=self.responses(self.archive(), 'sha256:' + '0' * 64)):
            with self.assertRaises(ValueError):
                updater.fetch_update()
        with patch('updater.urllib.request.urlopen', side_effect=self.responses(self.archive('../escape'))):
            with self.assertRaises(ValueError):
                updater.fetch_update()

    @unittest.skipIf(os.name == 'nt', 'POSIX process-wait test')
    @patch('updater.sys.platform', 'linux')
    def test_replace_installed_version_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'download'
            source.mkdir()
            executable = source / 'app'
            executable.write_text('new')
            installed = root / 'installed'
            installed.mkdir()
            (installed / 'app').write_text('old')
            with patch('updater.sys.executable', str(executable)), \
                 patch('updater.os.name', 'posix'), \
                 patch('updater.os.kill', side_effect=ProcessLookupError), \
                 patch('updater.subprocess.Popen') as launch:
                updater.apply_update(installed, 123)
            self.assertEqual((installed / 'app').read_text(), 'new')
            launch.assert_called_once()
            self.assertFalse((root / 'installed.old').exists())


if __name__ == '__main__':
    unittest.main()
