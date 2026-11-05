package dev.sparklecat.pluralmods;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateClientTest {
    private static final String HASH = String.join("", Collections.nCopies(64, "a"));
    private static final String RUNTIME = "plural-star-1.23.3-mods-7", VARIANT = "wallpaper-storage";

    private JSONObject release(String tag, String... names) throws Exception {
        JSONArray assets = new JSONArray();
        for (String name : names) assets.put(new JSONObject().put("name", name).put("state", "uploaded")
            .put("size", 1000).put("digest", "sha256:" + HASH)
            .put("browser_download_url", "https://github.com/" + UpdatePolicy.REPO + "/releases/download/" + tag + "/" + name));
        return new JSONObject().put("tag_name", tag).put("draft", false).put("prerelease", false).put("assets", assets);
    }
    private JSONArray history(int count) throws Exception {
        JSONArray rows = new JSONArray();
        for (int i = 0; i < count; i++) rows.put(release("desktop-v0.1." + i));
        return rows;
    }
    private UpdateClient.ReleasePageReader reader(JSONArray rows, List<String> requests) {
        return (url, limit) -> {
            requests.add(url);
            assertEquals(UpdatePolicy.API + "&page=" + requests.size(), url);
            assertEquals(2 * 1024 * 1024, limit);
            JSONArray page = new JSONArray();
            int start = (requests.size() - 1) * 20;
            for (int i = start; i < Math.min(start + 20, rows.length()); i++) page.put(rows.getJSONObject(i));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ApkPatcher.copy(new ByteArrayInputStream(page.toString().getBytes(StandardCharsets.UTF_8)), out, limit);
            return out.toString(StandardCharsets.UTF_8.name());
        };
    }
    @Test public void largeHistoryFindsAppPatchesAndCompatibilityOnLaterPages() throws Exception {
        JSONArray rows = history(40);
        String body = String.join("", Collections.nCopies(30000, "x"));
        for (int i = 0; i < rows.length(); i++) rows.getJSONObject(i).put("body", body);
        rows.put(release("v1.0.0", "sparklecat-plural-star-mods-1.0.0.apk", "SHA256SUMS"));
        rows.put(release("patches-v1.0.0", "patches-" + RUNTIME + "-" + VARIANT + "-1.0.0.bundle"));
        rows.put(release("compat-v1.23.3-patches-v1.0.0", "compat-" + HASH + ".zip"));
        byte[] oldResponse = rows.toString().getBytes(StandardCharsets.UTF_8);
        assertTrue(oldResponse.length > 1024 * 1024);
        assertThrows(IOException.class, () -> ApkPatcher.copy(new ByteArrayInputStream(oldResponse), new ByteArrayOutputStream(), 1024 * 1024));
        List<String> requests = new ArrayList<>();
        String json = UpdateClient.readReleases(reader(rows, requests));
        assertEquals(3, requests.size());
        assertEquals("1.0.0", UpdatePolicy.select(json, "0.6.7", true).version.name);
        assertEquals("1.0.0", UpdatePolicy.selectPatch(json, "0.4.41", RUNTIME, VARIANT).version.name);
        assertEquals("1.0.0", CompatibilityPack.select(json, HASH).version);
    }
    @Test public void stopsAtShortOrEmptyPageAndNeverReadsBeyondOneHundredReleases() throws Exception {
        for (int count : new int[]{0, 5, 20, 85, 100, 120}) {
            List<String> requests = new ArrayList<>();
            JSONArray result = new JSONArray(UpdateClient.readReleases(reader(history(count), requests)));
            assertEquals(Math.min(count, 100), result.length());
            assertEquals(Math.min(count / 20 + 1, 5), requests.size());
        }
    }
    @Test public void failedOrMalformedLaterPageNeverReturnsPartialHistory() throws Exception {
        String first = history(20).toString();
        for (String bad : Arrays.asList("not json", "{}", "[null]", history(21).toString())) {
            int[] calls = {0};
            assertThrows(IOException.class, () -> UpdateClient.readReleases((url, limit) -> ++calls[0] == 1 ? first : bad));
            assertEquals(2, calls[0]);
        }
        IOException failure = new IOException("Connection interrupted");
        int[] calls = {0};
        assertSame(failure, assertThrows(IOException.class, () -> UpdateClient.readReleases((url, limit) -> {
            if (++calls[0] == 1) return first;
            throw failure;
        })));
    }
    @Test public void individualPagesStillHaveABoundedDownloadSize() throws Exception {
        JSONArray rows = history(1);
        rows.getJSONObject(0).put("body", String.join("", Collections.nCopies(2 * 1024 * 1024, "x")));
        assertThrows(IOException.class, () -> UpdateClient.readReleases(reader(rows, new ArrayList<>())));
    }
}
