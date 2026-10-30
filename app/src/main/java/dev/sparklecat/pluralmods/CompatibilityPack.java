package dev.sparklecat.pluralmods;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** A verified bundle and native host built together for one exact official APK. */
public final class CompatibilityPack {
    static final long MAX_BYTES = 96L * 1024 * 1024;
    static final String UPSTREAM = "ByHanyou/Plural-Star";
    static final String LATEST_API = "https://api.github.com/repos/" + UPSTREAM + "/releases/latest";
    final File archive;
    final JSONObject info;
    CompatibilityPack(File archive, JSONObject info) { this.archive = archive; this.info = info; }

    static final class Asset {
        final String url, sha256, baseSha256, version;
        final long bytes;
        Asset(String url, String sha256, long bytes, String baseSha256, String version) {
            this.url = url; this.sha256 = sha256; this.bytes = bytes; this.baseSha256 = baseSha256; this.version = version;
        }
    }
    static Asset asset(JSONObject row, String repo, String name, long limit, String base, String version) {
        if (row.optBoolean("draft", true) || row.optBoolean("prerelease", false)) return null;
        JSONArray assets = row.optJSONArray("assets");
        if (assets == null) return null;
        Asset result = null;
        int matches = 0;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject a = assets.optJSONObject(i);
            if (a == null || !name.equals(a.optString("name"))) continue;
            matches++;
            String url = UpdatePolicy.trustedAsset(a.optString("browser_download_url"), repo, row.optString("tag_name"), name);
            String digest = a.optString("digest");
            Object size = a.opt("size");
            if (url == null || !"uploaded".equals(a.optString("state")) || !digest.matches("sha256:[0-9a-f]{64}") || !(size instanceof Number)) continue;
            long bytes = ((Number) size).longValue();
            if (((Number) size).doubleValue() != bytes || bytes < 1 || bytes > limit) continue;
            result = new Asset(url, digest.substring(7), bytes, base, version);
        }
        return matches == 1 ? result : null;
    }
    static Asset latestOriginal(String json) throws Exception {
        JSONObject row = new JSONObject(json);
        String tag = row.optString("tag_name");
        if (!tag.matches("v[0-9]+\\.[0-9]+\\.[0-9]+") || ReleaseVersion.parse(tag) == null)
            throw new IOException("The latest official release has an unsupported version.");
        Asset result = asset(row, UPSTREAM, "app-release.apk", UpdatePolicy.MAX_APK, "", tag.substring(1));
        if (result == null) throw new IOException("The latest official release has no verified standalone APK.");
        return result;
    }
    static Asset select(String json, String base) throws Exception {
        if (!base.matches("[0-9a-f]{64}")) throw new IOException("Invalid original APK checksum.");
        JSONArray rows = new JSONArray(json);
        Asset best = null;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null || !row.optString("tag_name").startsWith("compat-v")) continue;
            String version = UpdatePolicy.patchVersion(row.optString("tag_name"));
            ReleaseVersion parsed = ReleaseVersion.parse(version);
            if (parsed == null) continue;
            Asset candidate = asset(row, UpdatePolicy.REPO, "compat-" + base + ".zip", MAX_BYTES, base, version);
            if (candidate != null && (best == null || parsed.compareTo(ReleaseVersion.parse(best.version)) > 0)) best = candidate;
        }
        return best;
    }
    static CompatibilityPack read(File file, String base, String version) throws Exception {
        if (file.length() > MAX_BYTES) throw new IOException("Compatibility pack is too large.");
        try (ZipFile zip = new ZipFile(file)) {
            Set<String> names = new HashSet<>();
            for (Enumeration<? extends ZipEntry> entries = zip.entries(); entries.hasMoreElements();) {
                String name = entries.nextElement().getName();
                if (!Arrays.asList("provenance.json", "wallpaper-storage.bundle", "wallpaper-storage.dex", "source.zip").contains(name) || !names.add(name))
                    throw new IOException("Invalid compatibility pack contents.");
            }
            if (names.size() != 4) throw new IOException("Compatibility pack is incomplete.");
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            try (InputStream in = zip.getInputStream(zip.getEntry("provenance.json"))) { ApkPatcher.copy(in, data, 16384); }
            JSONObject info = new JSONObject(data.toString(StandardCharsets.UTF_8.name()));
            String patchVersion = info.getString("version"), runtime = info.getString("runtime");
            if (!base.equals(info.getString("supported_apk_sha256")) || ReleaseVersion.parse(patchVersion) == null ||
                version != null && !version.equals(patchVersion) || !runtime.matches("[a-z0-9.-]{1,80}") ||
                !info.getString("upstream").matches("[0-9a-f]{40}") || !"javascript".equals(info.getString("bundle_format")))
                throw new IOException("Compatibility pack does not match this APK.");
            for (String name : Arrays.asList("wallpaper-storage.bundle", "wallpaper-storage.dex", "source.zip")) {
                String expected = info.getJSONObject("files").getString(name);
                if (!expected.matches("[0-9a-f]{64}")) throw new IOException("Invalid compatibility checksum.");
                java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
                try (InputStream in = new java.security.DigestInputStream(zip.getInputStream(zip.getEntry(name)), digest)) {
                    ApkPatcher.copy(in, new OutputStream() { @Override public void write(int b) {} @Override public void write(byte[] b, int off, int len) {} },
                        name.equals("source.zip") ? 16L * 1024 * 1024 : UpdatePolicy.MAX_PATCH);
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
                if (!expected.contentEquals(hex)) throw new IOException("Compatibility pack checksum failed.");
            }
            return new CompatibilityPack(file, info);
        }
    }
    InputStream open(String name) throws IOException {
        ZipFile zip = new ZipFile(archive);
        try {
            return new FilterInputStream(zip.getInputStream(zip.getEntry(name))) {
                @Override public void close() throws IOException { try { super.close(); } finally { zip.close(); } }
            };
        } catch (Exception e) { zip.close(); throw e; }
    }
}
