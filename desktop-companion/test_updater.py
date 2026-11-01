import hashlib
import io
import json
import os
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


if __name__ == '__main__':
    unittest.main()
