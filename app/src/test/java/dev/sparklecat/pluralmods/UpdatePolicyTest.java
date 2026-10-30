package dev.sparklecat.pluralmods;

import com.android.apksig.ApkVerifier;
import org.json.*;
import org.junit.*;
import static org.junit.Assert.*;
import java.io.*;
import java.net.URI;
import java.nio.file.Files;
import java.util.*;

public class UpdatePolicyTest {
    @Test public void releaseNotesAreBoundedAndFollowSelectedRelease() throws Exception {
        JSONObject app = release("v0.6.0", false, false).put("body", "App notes" + (char)0 + "\nDetails");
        assertEquals("App notes\nDetails", UpdatePolicy.select(new JSONArray().put(app).toString(), "0.5.3", true).notes);
        JSONObject patch = patchRelease("0.4.5").put("body", "Patch notes");
        assertEquals("Patch notes", UpdatePolicy.selectPatch(new JSONArray().put(patch).toString(), "0.4.4", RUNTIME, VARIANT).notes);
        assertEquals(6000, UpdatePolicy.releaseNotes(String.join("", Collections.nCopies(7000, "x"))).length());
        for (Object body : Arrays.asList(JSONObject.NULL, new JSONObject(), "", 42))
            assertEquals("No release notes were provided.", UpdatePolicy.releaseNotes(body));
    }
    private JSONObject release(String tag, boolean preview, boolean draft) throws Exception {
        String name = "sparklecat-plural-star-mods-" + tag.substring(1) + ".apk";
        return new JSONObject().put("tag_name", tag).put("draft", draft).put("prerelease", preview).put("assets", new JSONArray()
            .put(asset(tag, name, 1000)).put(asset(tag, "SHA256SUMS", 200)));
    }
    private JSONObject asset(String tag, String name, long size) throws Exception {
        return new JSONObject().put("name", name).put("state", "uploaded").put("size", size)
            .put("browser_download_url", "https://github.com/" + UpdatePolicy.REPO + "/releases/download/" + tag + "/" + name);
    }
    @Test public void semanticVersionOrderingHandlesNumericAndPreviewVersions() {
        String[] versions = {"1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.9.0", "1.10.0", "2.0.0"};
        for (int i = 0; i < versions.length - 1; i++) assertTrue(versions[i], ReleaseVersion.parse(versions[i]).compareTo(ReleaseVersion.parse(versions[i+1])) < 0);
        assertEquals(0, ReleaseVersion.parse("v0.3.0").compareTo(ReleaseVersion.parse("0.3.0")));
        for (String invalid : Arrays.asList("latest", "1.2", "01.2.3", "1.2.3-beta.01", "1.2.3/other", "999999999999999999999999.0.0")) assertNull(invalid, ReleaseVersion.parse(invalid));
    }
    @Test public void selectsNewestCompleteEligibleReleaseIndependentlyOfListOrder() throws Exception {
        String json = new JSONArray().put(release("v0.4.0", false, false)).put(release("v0.10.0", false, false)).put(release("v0.5.0", false, false)).toString();
        assertEquals("0.10.0", UpdatePolicy.select(json, "0.3.0", true).version.name);
        assertNull(UpdatePolicy.select(json, "1.0.0", true));
    }
    @Test public void draftPreviewAndUnavailableAssetsAreExcluded() throws Exception {
        JSONArray json = new JSONArray().put(release("v9.0.0", false, true)).put(release("v0.5.0", true, false)).put(release("v0.4.0-beta.1", false, false)).put(release("v0.3.1", false, false));
        assertEquals("0.3.1", UpdatePolicy.select(json.toString(), "0.3.0", false).version.name);
        assertEquals("0.5.0", UpdatePolicy.select(json.toString(), "0.3.0", true).version.name);
    }
    @Test public void rejectsAssetsOutsideTheExactRepositoryRelease() throws Exception {
        for (String url : Arrays.asList("http://github.com/file", "https://github.com.evil.test/file", "https://evil.test/file", "https://github.com:444/file", "https://user@github.com/file", "https://github.com/other/repo/releases/download/v0.4.0/file.apk")) {
            JSONObject row = release("v0.4.0", false, false);
            row.getJSONArray("assets").getJSONObject(0).put("browser_download_url", url);
            assertNull(url, UpdatePolicy.select(new JSONArray().put(row).toString(), "0.3.0", true));
        }
        assertFalse(UpdatePolicy.downloadUrlAllowed(URI.create("http://release-assets.githubusercontent.com/file")));
        assertFalse(UpdatePolicy.downloadUrlAllowed(URI.create("https://release-assets.githubusercontent.com.evil.test/file")));
        assertTrue(UpdatePolicy.downloadUrlAllowed(URI.create("https://release-assets.githubusercontent.com/file?token=public-signed-url")));
    }
    @Test public void incompleteDuplicateAndOversizedAssetsAreNotOffered() throws Exception {
        JSONObject missing = release("v0.4.0", false, false); missing.getJSONArray("assets").remove(1);
        JSONObject oversized = release("v0.4.0", false, false); oversized.getJSONArray("assets").getJSONObject(0).put("size", UpdatePolicy.MAX_APK + 1);
        JSONObject duplicate = release("v0.4.0", false, false); duplicate.getJSONArray("assets").put(asset("v0.4.0", "SHA256SUMS", 200));
        for (JSONObject row : Arrays.asList(missing, oversized, duplicate)) assertNull(UpdatePolicy.select(new JSONArray().put(row).toString(), "0.3.0", true));
    }
    private static final String RUNTIME = "plural-star-1.23.3-mods-1", VARIANT = "wallpaper-storage";
    private JSONObject patchRelease(String version) throws Exception {
        String tag = "patches-v" + version;
        return new JSONObject().put("tag_name", tag).put("draft", false).put("prerelease", false)
            .put("assets", new JSONArray().put(asset(tag, "patches-" + RUNTIME + "-" + VARIANT + "-" + version + ".bundle", 1000)
                .put("digest", "sha256:" + String.join("", Collections.nCopies(64, "a")))));
    }
    @Test public void selectsNewestCompatibleStablePatchIndependentlyOfPatcherReleases() throws Exception {
        JSONObject compat = patchRelease("0.4.4");
        String compatTag = "compat-v1.24.0-patches-v0.4.4";
        compat.put("tag_name", compatTag);
        compat.getJSONArray("assets").getJSONObject(0).put("browser_download_url",
            "https://github.com/" + UpdatePolicy.REPO + "/releases/download/" + compatTag + "/patches-" + RUNTIME + "-" + VARIANT + "-0.4.4.bundle");
        assertEquals("0.4.4", UpdatePolicy.selectPatch(new JSONArray().put(compat).toString(), "0.4.3", RUNTIME, VARIANT).version.name);
        JSONArray rows = new JSONArray().put(patchRelease("0.4.3")).put(release("v9.0.0", false, false))
            .put(patchRelease("0.10.0")).put(patchRelease("0.5.0"))
            .put(patchRelease("8.0.0").put("prerelease", true)).put(patchRelease("9.0.0").put("draft", true));
        assertEquals("0.10.0", UpdatePolicy.selectPatch(rows.toString(), "0.4.2", RUNTIME, VARIANT).version.name);
        assertNull(UpdatePolicy.selectPatch(rows.toString(), "1.0.0", RUNTIME, VARIANT));
        assertNull(UpdatePolicy.selectPatch(rows.toString(), "0.4.2", RUNTIME, "storage"));
        assertNull(UpdatePolicy.selectPatch(rows.toString(), "0.4.2", "other-runtime", VARIANT));
        assertThrows(IOException.class, () -> UpdatePolicy.selectPatch("[]", "invalid", RUNTIME, VARIANT));
        assertThrows(IOException.class, () -> UpdatePolicy.selectPatch("[]", "0.4.2", null, VARIANT));
        assertThrows(IOException.class, () -> UpdatePolicy.selectPatch("[]", "0.4.2", RUNTIME, "unknown"));
    }
    @Test public void patchAssetsRequireExactUrlDigestSizeAndUniqueUploadedFile() throws Exception {
        for (Object bad : Arrays.asList(0, -1, UpdatePolicy.MAX_PATCH + 1, 1.5, "1000")) {
            JSONObject row = patchRelease("0.4.3"); row.getJSONArray("assets").getJSONObject(0).put("size", bad);
            assertNull(UpdatePolicy.selectPatch(new JSONArray().put(row).toString(), "0.4.2", RUNTIME, VARIANT));
        }
        for (String field : Arrays.asList("digest", "state", "browser_download_url")) {
            JSONObject row = patchRelease("0.4.3"); row.getJSONArray("assets").getJSONObject(0).put(field, "invalid");
            assertNull(UpdatePolicy.selectPatch(new JSONArray().put(row).toString(), "0.4.2", RUNTIME, VARIANT));
        }
        JSONObject duplicate = patchRelease("0.4.3");
        duplicate.getJSONArray("assets").put(duplicate.getJSONArray("assets").getJSONObject(0));
        assertNull(UpdatePolicy.selectPatch(new JSONArray().put(duplicate).toString(), "0.4.2", RUNTIME, VARIANT));
    }
    @Test public void checksumsMustBeUnambiguousAndMatchTheExactFilename() throws Exception {
        String hash = String.join("", Collections.nCopies(64, "a"));
        assertEquals(hash, UpdatePolicy.checksum(hash.toUpperCase(Locale.ROOT) + " *update.apk\r\n", "update.apk"));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum(hash + "  ../update.apk\n", "update.apk"));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum("invalid update.apk", "update.apk"));
        assertThrows(IOException.class, () -> UpdatePolicy.checksum(hash + "  update.apk\n" + hash + "  update.apk", "update.apk"));
    }
    @Test public void bothVersionNameAndCodeMustAdvanceAndMatchTheRelease() throws Exception {
        UpdatePolicy.Release next = UpdatePolicy.select(new JSONArray().put(release("v0.4.0", false, false)).toString(), "0.3.0", true);
        UpdatePolicy.checkVersion("0.4.0", 4, "0.3.0", 3, next);
        assertThrows(IOException.class, () -> UpdatePolicy.checkVersion("0.2.0", 4, "0.3.0", 3, null));
        assertThrows(IOException.class, () -> UpdatePolicy.checkVersion("0.4.0", 3, "0.3.0", 3, next));
        assertThrows(IOException.class, () -> UpdatePolicy.checkVersion("0.5.0", 5, "0.3.0", 3, next));
        assertThrows(IOException.class, () -> UpdateTrust.checkPackage("com.pluralspace.app", "dev.sparklecat.pluralmods"));
        UpdateTrust.checkPackage("dev.sparklecat.pluralmods", "dev.sparklecat.pluralmods");
    }
    @Test public void shortTamperedAndWrongHashDownloadsFailClosed() throws Exception {
        File file = Files.createTempFile("updater", ".apk").toFile();
        try {
            Files.write(file.toPath(), new byte[]{1,2,3});
            String hash = ApkPatcher.sha256(file);
            UpdateTrust.checkDownload(file, 3, hash);
            assertThrows(IOException.class, () -> UpdateTrust.checkDownload(file, 4, hash));
            Files.write(file.toPath(), new byte[]{3,2,1});
            assertThrows(IOException.class, () -> UpdateTrust.checkDownload(file, 3, hash));
            assertThrows(IOException.class, () -> UpdateTrust.checkDownload(file, 3, ""));
        } finally { file.delete(); }
    }
    @Test public void signerVerificationUsesRealApkSignaturesAndRejectsAChangedKey() throws Exception {
        String path = System.getenv("PLURAL_STAR_APK"); Assume.assumeNotNull(path);
        File file = new File(path);
        byte[] certificate = new ApkVerifier.Builder(file).setMinCheckedPlatformVersion(26).build().verify().getSignerCertificates().get(0).getEncoded();
        UpdateTrust.checkSigner(file, new byte[][]{certificate});
        assertThrows(IOException.class, () -> UpdateTrust.checkSigner(file, new byte[][]{new byte[]{1,2,3}}));
        assertThrows(IOException.class, () -> UpdateTrust.checkSigner(file, null));
    }
}
