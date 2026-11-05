package dev.sparklecat.pluralmods;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Adds the permission-protected media listener without rebuilding other manifest entries. */
final class MusicManifest {
    static final String SERVICE = "dev.sparklecat.music.MusicNotificationListener";
    private static final String ANDROID = "http://schemas.android.com/apk/res/android";
    private MusicManifest() {}

    static byte[] addService(byte[] xml) throws IOException {
        if (xml.length < 8 || xml.length > 4 * 1024 * 1024 || u16(xml, 0) != 3 || u16(xml, 2) != 8 || i32(xml, 4) != xml.length) throw invalid();
        List<byte[]> chunks = new ArrayList<>(); int poolIndex = -1, mapIndex = -1, applicationEnd = -1;
        for (int at = 8; at < xml.length;) {
            if (at > xml.length - 8) throw invalid();
            int header = u16(xml, at + 2), size = i32(xml, at + 4);
            if (header < 8 || size < header || size % 4 != 0 || size > xml.length - at) throw invalid();
            byte[] chunk = Arrays.copyOfRange(xml, at, at + size); int type = u16(chunk, 0);
            if (type == 1) { if (poolIndex != -1) throw invalid(); poolIndex = chunks.size(); }
            if (type == 0x180) { if (mapIndex != -1 || header != 8) throw invalid(); mapIndex = chunks.size(); }
            chunks.add(chunk); at += size;
        }
        if (poolIndex != 0 || mapIndex < 1) throw invalid();
        Pool pool = new Pool(chunks.get(poolIndex));
        for (int index = 0; index < chunks.size(); index++) {
            byte[] chunk = chunks.get(index); int type = u16(chunk, 0);
            if (type == 0x103) {
                if (chunk.length < 24) throw invalid();
                if ("application".equals(pool.get(i32(chunk, 20)))) {
                    if (applicationEnd != -1) throw invalid(); applicationEnd = index;
                }
            }
            if (type == 0x102) {
                if (chunk.length < 36) throw invalid();
                int count = u16(chunk, 28), step = u16(chunk, 26), start = 16 + u16(chunk, 24);
                if (step < 20 || start < 36 || (long) start + (long) step * count > chunk.length) throw invalid();
                if ("service".equals(pool.get(i32(chunk, 20)))) for (int a = 0; a < count; a++) {
                    int pos = start + step * a;
                    if ("name".equals(pool.get(i32(chunk, pos + 4))) && ANDROID.equals(pool.get(i32(chunk, pos))) && (chunk[pos + 15] & 255) == 3 && SERVICE.equals(pool.get(i32(chunk, pos + 16)))) return xml;
                }
            }
        }
        if (applicationEnd == -1) throw invalid();
        byte[] oldMap = chunks.get(mapIndex); List<Integer> ids = new ArrayList<>();
        for (int at = 8; at < oldMap.length; at += 4) ids.add(i32(oldMap, at));
        if (ids.size() > pool.strings.size()) throw invalid();
        int name = attribute(pool, ids, "name", 0x01010003);
        int permission = attribute(pool, ids, "permission", 0x01010006);
        int exported = attribute(pool, ids, "exported", 0x01010010);
        int ns = pool.add(ANDROID), service = pool.add("service"), filter = pool.add("intent-filter"), action = pool.add("action");
        int serviceName = pool.add(SERVICE), permissionName = pool.add("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE");
        int actionName = pool.add("android.service.notification.NotificationListenerService");
        ByteArrayOutputStream nodes = new ByteArrayOutputStream();
        nodes.write(start(service, new int[][] {{ns, name, serviceName, 3, serviceName}, {ns, permission, permissionName, 3, permissionName}, {ns, exported, -1, 0x12, -1}}));
        nodes.write(start(filter, new int[0][]));
        nodes.write(start(action, new int[][] {{ns, name, actionName, 3, actionName}}));
        nodes.write(end(action)); nodes.write(end(filter)); nodes.write(end(service));
        chunks.set(poolIndex, pool.encode());
        byte[] map = header(0x180, 8, 8 + ids.size() * 4);
        for (int i = 0; i < ids.size(); i++) put32(map, 8 + i * 4, ids.get(i));
        chunks.set(mapIndex, map);
        ByteArrayOutputStream result = new ByteArrayOutputStream(); result.write(new byte[8]);
        for (int i = 0; i < chunks.size(); i++) { if (i == applicationEnd) result.write(nodes.toByteArray()); result.write(chunks.get(i)); }
        byte[] bytes = result.toByteArray(); put16(bytes, 0, 3); put16(bytes, 2, 8); put32(bytes, 4, bytes.length); return bytes;
    }

    private static int attribute(Pool pool, List<Integer> ids, String name, int resource) throws IOException {
        int index = -1;
        for (int i = 0; i < pool.strings.size(); i++) if (name.equals(pool.strings.get(i)) && (i >= ids.size() || ids.get(i) == 0 || ids.get(i) == resource)) { index = i; break; }
        if (index < 0) { index = pool.strings.size(); pool.strings.add(name); }
        while (ids.size() <= index) ids.add(0); ids.set(index, resource); return index;
    }
    private static byte[] start(int name, int[][] attrs) {
        byte[] bytes = header(0x102, 16, 36 + 20 * attrs.length);
        put32(bytes, 8, 1); put32(bytes, 12, -1); put32(bytes, 16, -1); put32(bytes, 20, name);
        put16(bytes, 24, 20); put16(bytes, 26, 20); put16(bytes, 28, attrs.length);
        for (int i = 0; i < attrs.length; i++) {
            int pos = 36 + i * 20; int[] attr = attrs[i];
            put32(bytes, pos, attr[0]); put32(bytes, pos + 4, attr[1]); put32(bytes, pos + 8, attr[2]);
            put16(bytes, pos + 12, 8); bytes[pos + 15] = (byte) attr[3]; put32(bytes, pos + 16, attr[4]);
        }
        return bytes;
    }
    private static byte[] end(int name) {
        byte[] bytes = header(0x103, 16, 24); put32(bytes, 8, 1); put32(bytes, 12, -1); put32(bytes, 16, -1); put32(bytes, 20, name); return bytes;
    }
    private static final class Pool {
        final List<String> strings = new ArrayList<>();
        final byte[] original; final int count, styles, dataStart, stylesStart; final boolean utf8;
        Pool(byte[] bytes) throws IOException {
            original = bytes;
            if (bytes.length < 28 || u16(bytes, 2) != 28) throw invalid();
            count = i32(bytes, 8); styles = i32(bytes, 12); dataStart = i32(bytes, 20); stylesStart = i32(bytes, 24); utf8 = (i32(bytes, 16) & 0x100) != 0;
            if (count < 0 || styles < 0 || (long) 28 + ((long) count + styles) * 4 > dataStart || dataStart > bytes.length || (styles == 0 ? stylesStart != 0 : stylesStart < dataStart || stylesStart > bytes.length)) throw invalid();
            int end = stylesStart == 0 ? bytes.length : stylesStart;
            for (int i = 0; i < count; i++) {
                int offset = i32(bytes, 28 + i * 4); if (offset < 0 || offset >= end - dataStart) throw invalid();
                int[] pos = {dataStart + offset}; int length = length(bytes, pos, utf8, end);
                if (utf8) length = length(bytes, pos, true, end);
                long size = (long) length * (utf8 ? 1 : 2);
                if (size > end - pos[0] - (utf8 ? 1 : 2)) throw invalid();
                int stop = pos[0] + (int) size;
                if (bytes[stop] != 0 || !utf8 && bytes[stop + 1] != 0) throw invalid();
                strings.add(new String(bytes, pos[0], (int) size, utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE));
            }
        }
        String get(int index) throws IOException { if (index == -1) return ""; if (index < 0 || index >= count) throw invalid(); return strings.get(index); }
        int add(String value) { int index = strings.indexOf(value); if (index < 0) { index = strings.size(); strings.add(value); } return index; }
        byte[] encode() throws IOException {
            int oldEnd = stylesStart == 0 ? original.length : stylesStart;
            ByteArrayOutputStream data = new ByteArrayOutputStream(); data.write(original, dataStart, oldEnd - dataStart);
            int[] offsets = new int[strings.size()];
            for (int i = 0; i < count; i++) offsets[i] = i32(original, 28 + i * 4);
            for (int i = count; i < strings.size(); i++) {
                offsets[i] = data.size(); String value = strings.get(i); byte[] encoded = value.getBytes(utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE);
                writeLength(data, value.length(), utf8); if (utf8) writeLength(data, encoded.length, true);
                data.write(encoded); data.write(0); if (!utf8) data.write(0);
            }
            while (data.size() % 4 != 0) data.write(0);
            int newStart = 28 + 4 * (strings.size() + styles), styleSize = stylesStart == 0 ? 0 : original.length - stylesStart;
            byte[] bytes = header(1, 28, newStart + data.size() + styleSize);
            put32(bytes, 8, strings.size()); put32(bytes, 12, styles); put32(bytes, 16, i32(original, 16) & ~1);
            put32(bytes, 20, newStart); put32(bytes, 24, styles == 0 ? 0 : newStart + data.size());
            for (int i = 0; i < offsets.length; i++) put32(bytes, 28 + 4 * i, offsets[i]);
            System.arraycopy(original, 28 + 4 * count, bytes, 28 + 4 * offsets.length, 4 * styles);
            System.arraycopy(data.toByteArray(), 0, bytes, newStart, data.size());
            if (styleSize > 0) System.arraycopy(original, stylesStart, bytes, newStart + data.size(), styleSize);
            return bytes;
        }
    }
    private static int length(byte[] bytes, int[] pos, boolean utf8, int end) throws IOException {
        int unit = utf8 ? 1 : 2; if (pos[0] > end - unit) throw invalid();
        int first = utf8 ? bytes[pos[0]] & 255 : u16(bytes, pos[0]); pos[0] += unit;
        int high = utf8 ? 0x80 : 0x8000; if ((first & high) == 0) return first;
        if (pos[0] > end - unit) throw invalid();
        int second = utf8 ? bytes[pos[0]] & 255 : u16(bytes, pos[0]); pos[0] += unit;
        return ((first & ~high) << (utf8 ? 8 : 16)) | second;
    }
    private static void writeLength(ByteArrayOutputStream out, int length, boolean utf8) throws IOException {
        if (utf8) { if (length > 0x7fff) throw invalid(); if (length > 0x7f) out.write((length >> 8) | 0x80); out.write(length & 255); }
        else { if (length > 0x7fff) { out.write((length >> 16) & 255); out.write((length >> 24) | 0x80); } out.write(length & 255); out.write((length >> 8) & 255); }
    }
    private static byte[] header(int type, int header, int size) { byte[] bytes = new byte[size]; put16(bytes, 0, type); put16(bytes, 2, header); put32(bytes, 4, size); return bytes; }
    private static int u16(byte[] bytes, int pos) { return (bytes[pos] & 255) | (bytes[pos + 1] & 255) << 8; }
    private static int i32(byte[] bytes, int pos) { return u16(bytes, pos) | u16(bytes, pos + 2) << 16; }
    private static void put16(byte[] bytes, int pos, int value) { bytes[pos] = (byte) value; bytes[pos + 1] = (byte) (value >> 8); }
    private static void put32(byte[] bytes, int pos, int value) { put16(bytes, pos, value); put16(bytes, pos + 2, value >> 16); }
    private static IOException invalid() { return new IOException("This APK has an unsupported Android manifest."); }
}
