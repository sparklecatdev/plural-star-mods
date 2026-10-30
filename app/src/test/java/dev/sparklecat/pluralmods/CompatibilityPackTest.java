package dev.sparklecat.pluralmods;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.*;
import org.json.*;
import org.junit.*;
import static org.junit.Assert.*;

public class CompatibilityPackTest {
    private static final String BASE = "a".repeat(64), VERSION = "0.4.4";
    private File temp;
    @Before public void setup() throws Exception { temp = Files.createTempDirectory("compatibility-test").toFile(); }
    @After public void cleanup() throws Exception {
        try (var paths = Files.walk(temp.toPath())) { paths.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete()); }
    }
    private JSONObject row(String repo, String tag, String name) throws Exception {
        return new JSONObject().put("tag_name", tag).put("draft", false).put("prerelease", false)
            .put("assets", new JSONArray().put(new JSONObject().put("name", name).put("state", "uploaded")
                .put("digest", "sha256:" + BASE).put("size", 123)
                .put("browser_download_url", "https://github.com/" + repo + "/releases/download/" + tag + "/" + name)));
    }
    private JSONObject original() throws Exception { return row(CompatibilityPack.UPSTREAM, "v2.12.3", "app-release.apk"); }
    private JSONObject compat(String version) throws Exception {
        return row(UpdatePolicy.REPO, "compat-v2.12.3-patches-v" + version, "compat-" + BASE + ".zip");
    }
    @Test public void latestOfficialVersionIsResolvedWithoutAPinnedVersion() throws Exception {
        CompatibilityPack.Asset asset = CompatibilityPack.latestOriginal(original().toString());
        assertEquals("2.12.3", asset.version);
        assertEquals(BASE, asset.sha256);
        for (String field : List.of("digest", "size", "state", "browser_download_url")) {
            JSONObject bad = original();
            bad.getJSONArray("assets").getJSONObject(0).put(field, "invalid");
            assertThrows(Exception.class, () -> CompatibilityPack.latestOriginal(bad.toString()));
        }
        for (String flag : List.of("draft", "prerelease")) {
            JSONObject bad = original().put(flag, true);
            assertThrows(IOException.class, () -> CompatibilityPack.latestOriginal(bad.toString()));
        }
        JSONObject duplicate = original(); duplicate.getJSONArray("assets").put(duplicate.getJSONArray("assets").get(0));
        assertThrows(IOException.class, () -> CompatibilityPack.latestOriginal(duplicate.toString()));
    }
    @Test public void onlyExactVerifiedCompatibilityPacksAreSelected() throws Exception {
        String rows = new JSONArray().put(compat("0.4.4")).put(compat("0.10.0")).put(compat("0.5.0")).toString();
        assertEquals("0.10.0", CompatibilityPack.select(rows, BASE).version);
        assertNull(CompatibilityPack.select(rows, "b".repeat(64)));
        for (Object size : List.of(0, -1, CompatibilityPack.MAX_BYTES + 1, 1.5, "123")) {
            JSONObject bad = compat(VERSION); bad.getJSONArray("assets").getJSONObject(0).put("size", size);
            assertNull(CompatibilityPack.select(new JSONArray().put(bad).toString(), BASE));
        }
        for (String field : List.of("digest", "state", "browser_download_url")) {
            JSONObject bad = compat(VERSION); bad.getJSONArray("assets").getJSONObject(0).put(field, "invalid");
            assertNull(CompatibilityPack.select(new JSONArray().put(bad).toString(), BASE));
        }
        JSONObject duplicate = compat(VERSION); duplicate.getJSONArray("assets").put(duplicate.getJSONArray("assets").get(0));
        assertNull(CompatibilityPack.select(new JSONArray().put(duplicate).toString(), BASE));
        assertNull(CompatibilityPack.select(new JSONArray().put(compat(VERSION).put("prerelease", true)).toString(), BASE));
    }
    private Map<String, byte[]> files() {
        Map<String, byte[]> files = new LinkedHashMap<>();
        for (String name : List.of("wallpaper-storage.bundle", "wallpaper-storage.dex", "source.zip"))
            files.put(name, name.getBytes(StandardCharsets.UTF_8));
        return files;
    }
    private JSONObject manifest(Map<String, byte[]> files) throws Exception {
        JSONObject hashes = new JSONObject();
        File entry = new File(temp, "entry");
        for (var file : files.entrySet()) {
            Files.write(entry.toPath(), file.getValue()); hashes.put(file.getKey(), ApkPatcher.sha256(entry));
        }
        return new JSONObject().put("version", VERSION).put("runtime", "plural-star-2.12.3-mods-1")
            .put("supported_apk_sha256", BASE).put("upstream", "a".repeat(40)).put("bundle_format", "javascript").put("files", hashes);
    }
    private File archive(Map<String, byte[]> files, JSONObject manifest) throws Exception {
        File file = new File(temp, "pack.zip");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
            Map<String, byte[]> contents = new LinkedHashMap<>(files);
            contents.put("provenance.json", manifest.toString().getBytes(StandardCharsets.UTF_8));
            for (var entry : contents.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        return file;
    }
    @Test public void validatesEveryPayloadBeforeOpeningAPack() throws Exception {
        Map<String, byte[]> files = files(); JSONObject manifest = manifest(files);
        File zip = archive(files, manifest);
        CompatibilityPack pack = CompatibilityPack.read(zip, BASE, VERSION);
        try (InputStream in = pack.open("wallpaper-storage.bundle")) { assertArrayEquals(files.get("wallpaper-storage.bundle"), in.readAllBytes()); }
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, "b".repeat(64), VERSION));
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, BASE, "0.4.5"));
        files.put("wallpaper-storage.bundle", new byte[]{1}); archive(files, manifest);
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, BASE, VERSION));
        files = files(); files.put("../outside", new byte[]{1}); archive(files, manifest);
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, BASE, VERSION));
        files = files(); files.remove("source.zip"); archive(files, manifest);
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, BASE, VERSION));
        files = files(); manifest.put("runtime", "../outside"); archive(files, manifest);
        assertThrows(IOException.class, () -> CompatibilityPack.read(zip, BASE, VERSION));
    }
}
