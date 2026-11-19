"""A StatusNotifierItem with a panel-rendered menu for Linux desktops."""

from collections import deque

from jeepney import (DBusAddress, DBusErrorResponse, HeaderFields, MatchRule,
                     MessageFlag, MessageType, new_error, new_method_call,
                     new_method_return, new_signal)
from jeepney.io.blocking import open_dbus_connection
from PIL import Image


ITEM = DBusAddress('/StatusNotifierItem', interface='org.kde.StatusNotifierItem')
MENU = DBusAddress('/Menu', interface='com.canonical.dbusmenu')
WATCHER = DBusAddress('/StatusNotifierWatcher', bus_name='org.kde.StatusNotifierWatcher',
                      interface='org.kde.StatusNotifierWatcher')
PROPERTIES = 'org.freedesktop.DBus.Properties'
ITEMS = {
    0: {'children-display': ('s', 'submenu')},
    1: {'label': ('s', 'Open window')},
    2: {'label': ('s', 'Close app')},
}
ACTIONS = {1: 'open', 2: 'quit'}
LAYOUT = '(ia{sv}av)'


class TrayUnavailable(RuntimeError):
    pass


class LinuxTray:
    def __init__(self, icon, title, action):
        self.icon = icon
        self.title = title
        self.action = action
        self.appearance = (icon, title)
        self.pending = deque()
        try:
            self.connection = open_dbus_connection()
            with self.connection.filter(MatchRule(type='method_call'), queue=self.pending):
                self.register()
        except (OSError, RuntimeError, ValueError, DBusErrorResponse) as error:
            if hasattr(self, 'connection'):
                self.stop()
            raise TrayUnavailable('No desktop tray is available.') from error

    def register(self):
        host = new_method_call(WATCHER.with_interface(PROPERTIES), 'Get', 'ss',
                               (WATCHER.interface, 'IsStatusNotifierHostRegistered'))
        reply = self.connection.send_and_get_reply(host, timeout=1)
        if reply.body != (('b', True),):
            raise TrayUnavailable('No desktop tray is available.')
        register = new_method_call(WATCHER, 'RegisterStatusNotifierItem', 's', (ITEM.object_path,))
        if self.connection.send_and_get_reply(register, timeout=1).header.message_type != MessageType.method_return:
            raise TrayUnavailable('Could not register the tray icon.')

    def stop(self):
        self.connection.close()

    def poll(self):
        icon, title = self.appearance
        if icon is not self.icon:
            self.connection.send(new_signal(ITEM, 'NewIcon'))
        if title != self.title:
            self.connection.send(new_signal(ITEM, 'NewTitle'))
            self.connection.send(new_signal(ITEM, 'NewToolTip'))
        self.appearance = (self.icon, self.title)
        for _ in range(32):
            try:
                message = self.pending.popleft() if self.pending else self.connection.receive(timeout=0)
            except TimeoutError:
                return
            if message.header.message_type != MessageType.method_call:
                continue
            response = self.reply(message)
            if not message.header.flags & MessageFlag.no_reply_expected:
                self.connection.send(response)

    def properties(self, interface):
        if interface == MENU.interface:
            return {'Version': ('u', 3), 'TextDirection': ('s', 'ltr'),
                    'Status': ('s', 'normal'), 'IconThemePath': ('as', [])}
        rgba = self.icon.convert('RGBA')
        rgba.thumbnail((128, 128))
        red, green, blue, alpha = rgba.split()
        argb = Image.merge('RGBA', (alpha, red, green, blue)).tobytes()
        return {
            'Id': ('s', 'sparklecat-companion'),
            'Category': ('s', 'ApplicationStatus'),
            'Title': ('s', self.title),
            'Status': ('s', 'Active'),
            'WindowId': ('i', 0),
            'IconPixmap': ('a(iiay)', [(rgba.width, rgba.height, argb)]),
            'ToolTip': ('(sa(iiay)ss)', ('', [], self.title, '')),
            'ItemIsMenu': ('b', False),
            'Menu': ('o', MENU.object_path),
        }

    def reply(self, message):
        fields = message.header.fields
        path = fields[HeaderFields.path]
        interface = fields.get(HeaderFields.interface)
        member = fields[HeaderFields.member]
        signature = fields.get(HeaderFields.signature, '')
        body = message.body
        try:
            if interface == PROPERTIES and (
                (path == ITEM.object_path and body[:1] == (ITEM.interface,))
                or (path == MENU.object_path and body[:1] == (MENU.interface,))
            ):
                if (member, signature) == ('GetAll', 's'):
                    return new_method_return(message, 'a{sv}', (self.properties(body[0]),))
                if (member, signature) == ('Get', 'ss'):
                    return new_method_return(message, 'v', (self.properties(body[0])[body[1]],))
            if path == ITEM.object_path and interface == ITEM.interface:
                if (member, signature) == ('Activate', 'ii'):
                    self.action('open')
                    return new_method_return(message)
                if (member, signature) == ('ProvideXdgActivationToken', 's'):
                    return new_method_return(message)
            if path == MENU.object_path and interface == MENU.interface:
                result = self.menu_reply(member, signature, body)
                if result is not None:
                    return new_method_return(message, *result)
        except KeyError:
            return new_error(message, 'org.freedesktop.DBus.Error.InvalidArgs')
        return new_error(message, 'org.freedesktop.DBus.Error.UnknownMethod')

    def menu_reply(self, member, signature, body):
        call = (member, signature)
        if call == ('GetLayout', 'iias'):
            item, depth, names = body
            children = [(LAYOUT, (child, menu_properties(child, names), []))
                        for child in ACTIONS] if item == 0 and depth != 0 else []
            return 'u' + LAYOUT, (1, (item, menu_properties(item, names), children))
        if call == ('GetGroupProperties', 'aias'):
            ids, names = body
            return 'a(ia{sv})', ([(item, menu_properties(item, names))
                                  for item in ids or ITEMS if item in ITEMS],)
        if call == ('GetProperty', 'is'):
            item, name = body
            return 'v', (ITEMS[item][name],)
        if call == ('AboutToShow', 'i'):
            return 'b', (False,)
        if call == ('AboutToShowGroup', 'ai'):
            return 'aiai', ([], [item for item in body[0] if item not in ITEMS])
        if call == ('Event', 'isvu'):
            self.menu_event(*body[:2])
            return None, ()
        if call == ('EventGroup', 'a(isvu)'):
            for item, event, _, _ in body[0]:
                self.menu_event(item, event)
            return 'ai', ([item for item, *_ in body[0] if item not in ITEMS],)
        return None

    def menu_event(self, item, event):
        if event == 'clicked' and item in ACTIONS:
            self.action(ACTIONS[item])


def menu_properties(item, names):
    return {key: value for key, value in ITEMS[item].items() if not names or key in names}
