import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import settings


class SettingsTests(unittest.TestCase):
    def test_preferences_exclude_credentials(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(settings, 'config_path', return_value=Path(directory) / 'settings.json'):
            data = {'relay': 'https://example.com', 'remember': True, 'autostart': True, 'close_mode': 'tray'}
            settings.save(data)
            self.assertEqual(settings.load(), data)
            self.assertNotIn('password', json.loads(settings.config_path().read_text()))

    @unittest.skipIf(os.name == 'nt' or settings.sys.platform == 'darwin', 'XDG startup test')
    def test_linux_autostart_create_and_remove(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(os.environ, {'XDG_CONFIG_HOME': directory}), mock.patch.object(settings, 'startup_command', return_value=['/a path/app', '--autostart']):
            path = Path(directory) / 'autostart' / (settings.SERVICE + '.desktop')
            settings.set_autostart(True)
            self.assertIn('Exec="/a path/app" "--autostart"', path.read_text())
            settings.set_autostart(False)
            self.assertFalse(path.exists())

    def test_credentials_use_keyring(self):
        import keyring
        with mock.patch.object(keyring, 'set_password') as store, mock.patch.object(keyring, 'get_password', return_value='secret'):
            settings.credential('password', 'secret')
            store.assert_called_once_with(settings.SERVICE, 'password', 'secret')
            self.assertEqual(settings.credential('password'), 'secret')


if __name__ == '__main__':
    unittest.main()
