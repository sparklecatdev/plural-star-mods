package dev.sparklecat.pluralmods;

import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Adds the package visibility declarations required by Discord's Android RPC. */
final class DiscordManifest {
    private static final int NONE = -1;
    private static int u16(byte[] b, int p) { return (b[p] & 255) | ((b[p + 1] & 255) << 8); }
    private static int i32(byte[] b, int p) { return ByteBuffer.wrap(b, p, 4).order(ByteOrder.LITTLE_ENDIAN).getInt(); }
    private static void put(byte[] b, int p, int n) { ByteBuffer.wrap(b, p, 4).order(ByteOrder.LITTLE_ENDIAN).putInt(n); }
    private static void word(ByteArrayOutputStream b, int n) { b.write(n); b.write(n >>> 8); }
    private static void integer(ByteArrayOutputStream b, int n) { word(b, n); word(b, n >>> 16); }
    private static void length8(ByteArrayOutputStream b, int n) { if (n > 127) b.write((n >>> 8) | 128); b.write(n); }
    private static void length16(ByteArrayOutputStream b, int n) { if (n > 32767) word(b, (n >>> 16) | 32768); word(b, n); }
    private static String string(byte[] b, int p, boolean utf8) {
        int len = u16(b, p);
        if (utf8) {
            int c = b[p++] & 255; if ((c & 128) != 0) p++;
            len = b[p++] & 255; if ((len & 128) != 0) len = ((len & 127) << 8) | (b[p++] & 255);
            return new String(b, p, len, StandardCharsets.UTF_8);
        }
        p += 2; if ((len & 32768) != 0) { len = ((len & 32767) << 16) | u16(b, p); p += 2; }
        return new String(b, p, len * 2, StandardCharsets.UTF_16LE);
    }
    private static byte[] start(int name, int namespace, int attr, int value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        word(out, 0x102); word(out, 16); integer(out, attr == NONE ? 36 : 56);
        integer(out, 0); integer(out, NONE); integer(out, NONE); integer(out, name);
        word(out, 20); word(out, 20); word(out, attr == NONE ? 0 : 1); word(out, 0); word(out, 0); word(out, 0);
        if (attr != NONE) { integer(out, namespace); integer(out, attr); integer(out, value); word(out, 8); out.write(0); out.write(3); integer(out, value); }
        return out.toByteArray();
    }
    private static byte[] end(int name) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        word(out, 0x103); word(out, 16); integer(out, 24); integer(out, 0); integer(out, NONE); integer(out, NONE); integer(out, name);
        return out.toByteArray();
    }
    static byte[] addQueries(byte[] xml) throws IOException {
        try {
            if (u16(xml, 0) != 3 || i32(xml, 4) != xml.length || u16(xml, 8) != 1) throw new IOException("Unsupported Android manifest.");
            int pool = 8, size = i32(xml, pool + 4), header = u16(xml, pool + 2), count = i32(xml, pool + 8);
            int styles = i32(xml, pool + 12), flags = i32(xml, pool + 16), data = i32(xml, pool + 20), styleData = i32(xml, pool + 24);
            boolean utf8 = (flags & 0x100) != 0;
            List<String> strings = new ArrayList<>();
            for (int i = 0; i < count; i++) strings.add(string(xml, pool + data + i32(xml, pool + header + i * 4), utf8));
            int nameAttr = strings.indexOf("name"), namespace = strings.indexOf("http://schemas.android.com/apk/res/android");
            if (nameAttr < 0 || namespace < 0) throw new IOException("Android manifest lacks the name attribute.");
            String[] extra = {"queries", "package", "com.discord"};
            int[] ids = new int[extra.length];
            ByteArrayOutputStream added = new ByteArrayOutputStream();
            int oldEnd = styleData == 0 ? size : styleData, oldStringBytes = oldEnd - data;
            for (int i = 0; i < extra.length; i++) {
                ids[i] = strings.indexOf(extra[i]);
                if (ids[i] >= 0) continue;
                ids[i] = strings.size(); strings.add(extra[i]);
                byte[] encoded = extra[i].getBytes(utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE);
                if (utf8) { length8(added, extra[i].length()); length8(added, encoded.length); }
                else length16(added, extra[i].length());
                added.write(encoded); added.write(0); if (!utf8) added.write(0);
            }
            int newCount = strings.size(), offsetsSize = (newCount - count) * 4;
            ByteArrayOutputStream poolOut = new ByteArrayOutputStream();
            poolOut.write(xml, pool, header);
            poolOut.write(xml, pool + header, count * 4);
            int off = oldStringBytes;
            for (int i = count; i < newCount; i++) {
                integer(poolOut, off);
                byte[] encoded = strings.get(i).getBytes(utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE);
                int n = strings.get(i).length();
                off += encoded.length + (utf8 ? 1 + (n > 127 ? 2 : 1) + (encoded.length > 127 ? 2 : 1) : 2 + (n > 32767 ? 4 : 2));
            }
            poolOut.write(xml, pool + header + count * 4, styles * 4);
            poolOut.write(xml, pool + data, oldStringBytes); poolOut.write(added.toByteArray());
            while ((poolOut.size() & 3) != 0) poolOut.write(0);
            int newStyleData = styleData == 0 ? 0 : poolOut.size();
            if (styleData != 0) poolOut.write(xml, pool + styleData, size - styleData);
            byte[] newPool = poolOut.toByteArray();
            put(newPool, 4, newPool.length); put(newPool, 8, newCount); put(newPool, 20, data + offsetsSize); put(newPool, 24, newStyleData);
            int insertion = -1; boolean insideQueries = false;
            for (int p = pool + size; p < xml.length;) {
                int chunkSize = i32(xml, p + 4); if (chunkSize < 8 || p + chunkSize > xml.length) throw new IOException("Invalid Android manifest chunk.");
                if (u16(xml, p) == 0x102) {
                    int index = i32(xml, p + 20); String tag = strings.get(index);
                    if (tag.equals("queries")) { insertion = p + chunkSize; insideQueries = true; break; }
                    if (tag.equals("application")) { insertion = p; break; }
                }
                p += chunkSize;
            }
            if (insertion < 0) throw new IOException("Android manifest has no application element.");
            ByteArrayOutputStream result = new ByteArrayOutputStream();
            result.write(xml, 0, pool); result.write(newPool); result.write(xml, pool + size, insertion - pool - size);
            if (!insideQueries) result.write(start(ids[0], NONE, NONE, NONE));
            result.write(start(ids[1], namespace, nameAttr, ids[2])); result.write(end(ids[1]));
            if (!insideQueries) result.write(end(ids[0]));
            result.write(xml, insertion, xml.length - insertion);
            byte[] updated = result.toByteArray(); put(updated, 4, updated.length); return updated;
        } catch (IndexOutOfBoundsException | IllegalArgumentException e) { throw new IOException("Invalid Android manifest.", e); }
    }
}
