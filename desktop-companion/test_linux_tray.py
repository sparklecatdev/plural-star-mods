import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from time import monotonic, sleep


@unittest.skipUnless(os.environ.get('SPARKLECAT_TEST_TRAY') == '1', 'requires an isolated D-Bus session')
class LinuxTrayTest(unittest.TestCase):
    def test_panel_can_open_window_and_close_app(self):
        from jeepney import DBusAddress, HeaderFields, new_method_call, new_method_return
        from jeepney.io.blocking import open_dbus_connection
        from PIL import Image

        from linux_tray import ITEM, MENU, PROPERTIES, WATCHER, LinuxTray, TrayUnavailable

        icon = Image.new('RGBA', (1, 1), (1, 2, 3, 4))
        actions = []
        with self.assertRaises(TrayUnavailable):
            LinuxTray(icon, 'Companion', actions.append)

        with open_dbus_connection() as panel, ThreadPoolExecutor(max_workers=1) as executor:
            panel.bus_proxy.RequestName(WATCHER.bus_name)

            def panel_method(member):
                while True:
                    message = panel.receive(timeout=2)
                    if message.header.fields.get(HeaderFields.member) == member:
                        return message

            def register_item():
                query = panel_method('Get')
                self.assertEqual(query.body, (WATCHER.interface, 'IsStatusNotifierHostRegistered'))
                panel.send(new_method_return(query, 'v', (('b', True),)))
                register = panel_method('RegisterStatusNotifierItem')
                self.assertEqual(register.body, (ITEM.object_path,))
                panel.send(new_method_return(register))
                return register.header.fields[HeaderFields.sender]

            registered = executor.submit(register_item)
            tray = LinuxTray(icon, 'Companion', actions.append)
            self.addCleanup(tray.stop)
            name = registered.result(timeout=2)
            item = DBusAddress(ITEM.object_path, bus_name=name, interface=ITEM.interface)
            menu = DBusAddress(MENU.object_path, bus_name=name, interface=MENU.interface)

            def call(address, member, signature, body):
                request = new_method_call(address, member, signature, body)
                reply = panel.send_and_get_reply(request, timeout=2)
                return reply.body

            def use_tray():
                properties, = call(item.with_interface(PROPERTIES), 'GetAll', 's', (ITEM.interface,))
                self.assertEqual(properties['Menu'], ('o', MENU.object_path))
                self.assertEqual(properties['IconPixmap'], ('a(iiay)', [(1, 1, b'\x04\x01\x02\x03')]))
                _, (_, _, children) = call(menu, 'GetLayout', 'iias', (0, -1, []))
                self.assertEqual([(child[1][0], child[1][1]['label'][1]) for child in children],
                                 [(1, 'Open window'), (2, 'Close app')])
                call(item, 'Activate', 'ii', (0, 0))
                call(menu, 'Event', 'isvu', (1, 'clicked', ('i', 0), 0))
                call(menu, 'Event', 'isvu', (2, 'clicked', ('i', 0), 0))

            interaction = executor.submit(use_tray)
            deadline = monotonic() + 3
            while not interaction.done() and monotonic() < deadline:
                tray.poll()
                sleep(0.01)
            interaction.result(timeout=2)
            self.assertEqual(actions, ['open', 'open', 'quit'])
