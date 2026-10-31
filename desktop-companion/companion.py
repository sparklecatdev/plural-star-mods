#!/usr/bin/env python3
"""Show a public PluralKit front in the local Discord client's activity."""
import json
import os
import queue
import re
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
import uuid
import tkinter as tk
from tkinter import ttk

CLIENT_ID = '1566174520350347434'
INTERVAL = 30


def system_id(value):
    value = value.strip().lower().replace('-', '')
    if not re.fullmatch(r'[a-z]{5,6}', value):
        raise ValueError('Enter your 5- or 6-letter PluralKit system ID.')
    return value


def get_front(value):
    request = urllib.request.Request(
        'https://api.pluralkit.me/v2/systems/' + system_id(value) + '/fronters',
        headers={'User-Agent': 'Sparklecat-Desktop-Companion/1.0', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status == 204:
                return []
            data = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 403:
            raise ValueError('Your PluralKit current fronter must be public.') from error
        if error.code == 404:
            raise ValueError('PluralKit system not found. Check your system ID.') from error
        raise ValueError('PluralKit returned HTTP ' + str(error.code)) from error
    if not isinstance(data, dict) or not isinstance(data.get('members'), list):
        raise ValueError('Unexpected response from PluralKit.')
    names = []
    for member in data['members']:
        if isinstance(member, dict):
            name = member.get('display_name') or member.get('name')
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def activity_for(names):
    if not names:
        return None
    return {'details': 'Currently fronting', 'state': ', '.join(names)[:128]}


class Discord:
    def __init__(self):
        self.stream = None

    def connect(self):
        if os.name == 'nt':
            import ctypes
            import msvcrt
            for index in range(10):
                try:
                    stream = open(r'\\?\pipe\discord-ipc-' + str(index), 'r+b', buffering=0)
                    mode = ctypes.c_ulong(1)  # PIPE_NOWAIT
                    if not ctypes.windll.kernel32.SetNamedPipeHandleState(
                            ctypes.c_void_p(msvcrt.get_osfhandle(stream.fileno())),
                            ctypes.byref(mode), None, None):
                        stream.close()
                        continue
                    self.stream = stream
                    break
                except OSError:
                    continue
        else:
            prefix = next((os.environ[x] for x in ('XDG_RUNTIME_DIR', 'TMPDIR', 'TMP', 'TEMP') if os.environ.get(x)), '/tmp')
            for index in range(10):
                stream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                stream.settimeout(5)
                try:
                    stream.connect(os.path.join(prefix, 'discord-ipc-' + str(index)))
                    self.stream = stream
                    break
                except OSError:
                    stream.close()
        if self.stream is None:
            raise ConnectionError('Open the Discord desktop app and try again.')
        self.send(0, {'v': 1, 'client_id': CLIENT_ID})
        opcode, response = self.receive()
        if opcode != 1 or response.get('evt') != 'READY':
            raise ConnectionError('Discord rejected the connection.')

    def send(self, opcode, payload):
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        packet = struct.pack('<II', opcode, len(body)) + body
        if os.name == 'nt':
            self.stream.write(packet)
        else:
            self.stream.sendall(packet)

    def read_exact(self, size):
        result = bytearray()
        deadline = time.monotonic() + 5
        while len(result) < size:
            try:
                part = self.stream.read(size - len(result)) if os.name == 'nt' else self.stream.recv(size - len(result))
                if not part:
                    raise ConnectionError('Discord disconnected.')
                result.extend(part)
            except OSError as error:
                if os.name != 'nt' or getattr(error, 'winerror', None) not in (232, 233, 234):
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError('Discord did not respond.') from error
                time.sleep(0.05)
        return bytes(result)

    def receive(self):
        opcode, size = struct.unpack('<II', self.read_exact(8))
        if size > 1024 * 1024:
            raise ValueError('Discord sent an invalid response.')
        return opcode, json.loads(self.read_exact(size))

    def set_activity(self, activity):
        nonce = str(uuid.uuid4())
        self.send(1, {'cmd': 'SET_ACTIVITY', 'args': {'pid': os.getpid(), 'activity': activity}, 'nonce': nonce})
        while True:
            opcode, response = self.receive()
            if opcode == 3:
                self.send(4, response)
            elif opcode == 2:
                raise ConnectionError('Discord disconnected.')
            elif response.get('nonce') == nonce:
                if response.get('evt') == 'ERROR':
                    raise ConnectionError('Discord rejected the activity: ' + str(response.get('data', {}).get('message', 'unknown error')))
                return

    def close(self):
        if self.stream:
            self.stream.close()
            self.stream = None


def run_worker(value, stop, messages):
    discord = Discord()
    try:
        while not stop.is_set():
            try:
                names = get_front(value)
                if not discord.stream:
                    discord.connect()
                discord.set_activity(activity_for(names))
                messages.put('Showing: ' + ', '.join(names) if names else 'No public fronters to show.')
            except (OSError, ValueError, ConnectionError, json.JSONDecodeError) as error:
                if discord.stream:
                    try:
                        discord.set_activity(None)
                    except (OSError, ValueError, ConnectionError):
                        pass
                    discord.close()
                messages.put(str(error) + ' Retrying automatically.')
            stop.wait(INTERVAL)
    finally:
        if discord.stream:
            try:
                discord.set_activity(None)
            except (OSError, ValueError, ConnectionError):
                pass
            discord.close()
        messages.put(None)


def main():
    root = tk.Tk()
    root.title('Sparklecat Discord Companion')
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=20)
    frame.grid(sticky='nsew')
    ttk.Label(frame, text='Discord fronting presence', font=('TkDefaultFont', 15, 'bold')).grid(row=0, column=0, columnspan=2, sticky='w')
    ttk.Label(frame, text='Enter your PluralKit system ID. Current fronter must be public.').grid(row=1, column=0, columnspan=2, pady=(10, 8), sticky='w')
    value = tk.StringVar()
    entry = ttk.Entry(frame, textvariable=value, width=30)
    entry.grid(row=2, column=0, sticky='ew')
    status = tk.StringVar(value='Stopped. Open Discord, then select Start.')
    ttk.Label(frame, textvariable=status, wraplength=420).grid(row=3, column=0, columnspan=2, pady=(12, 0), sticky='w')
    messages = queue.Queue()
    state = {'stop': None, 'closing': False}

    def toggle():
        if state['stop']:
            state['stop'].set()
            button.config(state='disabled')
            status.set('Stopping...')
            return
        try:
            current = system_id(value.get())
        except ValueError as error:
            status.set(str(error))
            return
        state['stop'] = threading.Event()
        entry.config(state='disabled')
        button.config(text='Stop')
        status.set('Connecting...')
        threading.Thread(target=run_worker, args=(current, state['stop'], messages), daemon=True).start()

    button = ttk.Button(frame, text='Start', command=toggle)
    button.grid(row=2, column=1, padx=(8, 0))

    def poll():
        try:
            while True:
                message = messages.get_nowait()
                if message is None:
                    state['stop'] = None
                    if state['closing']:
                        root.destroy()
                        return
                    entry.config(state='normal')
                    button.config(text='Start', state='normal')
                    status.set('Stopped.')
                elif not state['closing']:
                    status.set(message)
        except queue.Empty:
            pass
        root.after(200, poll)

    def close():
        if state['stop']:
            state['closing'] = True
            state['stop'].set()
            root.withdraw()
        else:
            root.destroy()

    root.protocol('WM_DELETE_WINDOW', close)
    root.after(200, poll)
    root.mainloop()


if __name__ == '__main__':
    main()
