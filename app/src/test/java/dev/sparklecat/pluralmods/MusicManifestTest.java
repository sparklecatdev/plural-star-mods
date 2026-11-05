package dev.sparklecat.pluralmods;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MusicManifestTest {
    private static final String ANDROID = "http://schemas.android.com/apk/res/android";

    @Test public void addsProtectedServiceAndPreservesOriginalNodesAndStrings() throws Exception {
        for (boolean utf8 : new boolean[]{true, false}) {
            byte[] original = manifest(utf8, false), updated = MusicManifest.addService(original);
            List<byte[]> before = chunks(original), after = chunks(updated);
            List<String> oldStrings = strings(before.get(0)), names = strings(after.get(0));
            assertEquals(oldStrings, names.subList(0, oldStrings.size()));
            assertEquals(before.size() + 6, after.size());
            assertArrayEquals(before.get(2), after.get(2)); // application start
            assertArrayEquals(before.get(3), after.get(9)); // application end
            assertEquals(0, u32(after.get(0), 16) & 1); // appended pool is no longer sorted
            byte[] service = after.get(3), action = after.get(5), map = after.get(1);
            assertEquals("service", names.get(u32(service, 20)));
            assertEquals("intent-filter", names.get(u32(after.get(4), 20)));
            assertAttribute(service, names, map, "name", 0x01010003, MusicManifest.SERVICE);
            assertAttribute(service, names, map, "permission", 0x01010006, "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE");
            assertAttribute(service, names, map, "exported", 0x01010010, "true");
            assertEquals("action", names.get(u32(action, 20)));
            assertAttribute(action, names, map, "name", 0x01010003, "android.service.notification.NotificationListenerService");
            assertArrayEquals(updated, MusicManifest.addService(updated));
        }
    }

    @Test public void preservesStyledPools() throws Exception {
        byte[] original = manifest(true, true), updated = MusicManifest.addService(original);
        byte[] before = chunks(original).get(0), after = chunks(updated).get(0);
        assertEquals(1, u32(after, 12));
        assertEquals(u32(before, 28 + 4 * u32(before, 8)), u32(after, 28 + 4 * u32(after, 8)));
        assertArrayEquals(Arrays.copyOfRange(before, u32(before, 24), before.length), Arrays.copyOfRange(after, u32(after, 24), after.length));
    }

    @Test public void rejectsMalformedManifestWithoutUncheckedExceptions() throws Exception {
        byte[] valid = manifest(true, false);
        List<byte[]> invalid = new ArrayList<>(List.of(new byte[0], Arrays.copyOf(valid, 7), Arrays.copyOf(valid, valid.length - 4)));
        byte[] badOffset = valid.clone(); put(badOffset, 8 + 28, Integer.MAX_VALUE); invalid.add(badOffset);
        byte[] badCount = valid.clone(); put(badCount, 8 + 8, Integer.MAX_VALUE); invalid.add(badCount);
        byte[] badChunk = valid.clone(); put(badChunk, 8 + 4, 9); invalid.add(badChunk);
        for (byte[] input : invalid) {
            try { MusicManifest.addService(input); fail("must reject malformed manifest"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("manifest")); }
        }
    }

    @Test public void oldRuntimeDoesNotReceiveMusicManifestChanges() throws Exception {
        java.nio.file.Path directory = java.nio.file.Files.createTempDirectory("legacy-music-manifest");
        try {
            java.io.File input = directory.resolve("input.apk").toFile(), output = directory.resolve("output.apk").toFile();
            byte[] original = manifest(true, false);
            try (var zip = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(input))) {
                for (String name : List.of("AndroidManifest.xml", ApkPatcher.BUNDLE, "classes2.dex")) {
                    zip.putNextEntry(new java.util.zip.ZipEntry(name)); zip.write(name.equals("AndroidManifest.xml") ? original : new byte[]{1}); zip.closeEntry();
                }
            }
            ApkPatcher.rewrite(input, output, () -> new java.io.ByteArrayInputStream(new byte[]{2}), () -> new java.io.ByteArrayInputStream(new byte[]{3}), null, java.util.Map.of(), false);
            try (var zip = new java.util.zip.ZipFile(output)) { assertArrayEquals(original, zip.getInputStream(zip.getEntry("AndroidManifest.xml")).readAllBytes()); }
        } finally {
            try (var paths = java.nio.file.Files.walk(directory)) { paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> path.toFile().delete()); }
        }
    }

    private static void assertAttribute(byte[] node, List<String> strings, byte[] map, String name, int resource, String expected) {
        int count = u16(node, 28), start = 16 + u16(node, 24), step = u16(node, 26);
        for (int i = 0; i < count; i++) {
            int at = start + i * step, index = u32(node, at + 4);
            if (!name.equals(strings.get(index))) continue;
            assertEquals(ANDROID, strings.get(u32(node, at)));
            assertEquals(resource, u32(map, 8 + 4 * index));
            int type = node[at + 15] & 255, value = u32(node, at + 16);
            assertEquals(expected, type == 0x12 ? (value == 0 ? "false" : "true") : strings.get(value));
            return;
        }
        fail("Missing attribute: " + name);
    }

    private static byte[] manifest(boolean utf8, boolean styled) throws Exception {
        List<String> names = List.of("application", ANDROID, "name", "long".repeat(40) + "é");
        ByteArrayOutputStream data = new ByteArrayOutputStream(); int[] offsets = new int[names.size()];
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i); byte[] encoded = name.getBytes(utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE); offsets[i] = data.size();
            if (utf8) { length8(data, name.length()); length8(data, encoded.length); } else { data.write(name.length() & 255); data.write(name.length() >> 8); }
            data.write(encoded); data.write(0); if (!utf8) data.write(0);
        }
        while (data.size() % 4 != 0) data.write(0);
        int start = 28 + 4 * (names.size() + (styled ? 1 : 0));
        byte[] pool = chunk(1, 28, start + data.size() + (styled ? 12 : 0));
        put(pool, 8, names.size()); put(pool, 12, styled ? 1 : 0); put(pool, 16, (utf8 ? 0x100 : 0) | 1); put(pool, 20, start); put(pool, 24, styled ? start + data.size() : 0);
        for (int i = 0; i < offsets.length; i++) put(pool, 28 + 4 * i, offsets[i]);
        System.arraycopy(data.toByteArray(), 0, pool, start, data.size());
        if (styled) Arrays.fill(pool, start + data.size(), pool.length, (byte) 0xff);
        byte[] map = chunk(0x180, 8, 20); put(map, 16, 0x01010003);
        byte[] open = chunk(0x102, 16, 36); put(open, 16, -1); put(open, 20, 0); open[24] = 20; open[26] = 20;
        byte[] close = chunk(0x103, 16, 24); put(close, 16, -1); put(close, 20, 0);
        ByteArrayOutputStream result = new ByteArrayOutputStream(); result.write(new byte[8]); result.write(pool); result.write(map); result.write(open); result.write(close);
        byte[] bytes = result.toByteArray(); bytes[0] = 3; bytes[2] = 8; put(bytes, 4, bytes.length); return bytes;
    }
    private static List<byte[]> chunks(byte[] xml) {
        List<byte[]> result = new ArrayList<>();
        for (int at = 8; at < xml.length;) { int size = u32(xml, at + 4); result.add(Arrays.copyOfRange(xml, at, at + size)); at += size; }
        return result;
    }
    private static List<String> strings(byte[] pool) {
        List<String> result = new ArrayList<>(); boolean utf8 = (u32(pool, 16) & 0x100) != 0;
        for (int i = 0; i < u32(pool, 8); i++) {
            int at = u32(pool, 20) + u32(pool, 28 + 4 * i), size;
            if (utf8) {
                at += (pool[at] & 0x80) == 0 ? 1 : 2;
                int first = pool[at++] & 255; size = (first & 0x80) == 0 ? first : ((first & 0x7f) << 8) | (pool[at++] & 255);
            } else { size = u16(pool, at) * 2; at += 2; }
            result.add(new String(pool, at, size, utf8 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16LE));
        }
        return result;
    }
    private static void length8(ByteArrayOutputStream out, int size) { if (size > 127) out.write((size >> 8) | 0x80); out.write(size & 255); }
    private static byte[] chunk(int type, int header, int size) { byte[] value = new byte[size]; value[0] = (byte) type; value[1] = (byte) (type >> 8); value[2] = (byte) header; put(value, 4, size); return value; }
    private static int u16(byte[] bytes, int at) { return (bytes[at] & 255) | (bytes[at + 1] & 255) << 8; }
    private static int u32(byte[] bytes, int at) { return u16(bytes, at) | u16(bytes, at + 2) << 16; }
    private static void put(byte[] bytes, int at, int value) { for (int i = 0; i < 4; i++) bytes[at + i] = (byte) (value >> (8 * i)); }
}
