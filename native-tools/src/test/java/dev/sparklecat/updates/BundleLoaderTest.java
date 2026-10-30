package dev.sparklecat.updates;

import android.content.Context;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.json.JSONObject;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class BundleLoaderTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private File root;
    private Context context;

    @Before public void setup() throws Exception {
        root = temp.newFolder("sparklecat-updates");
        context = new Context() { public File getFilesDir() { return temp.getRoot(); } };
        coldStart();
    }
    private void coldStart() throws Exception {
        var selected = BundleLoader.class.getDeclaredField("selected"); selected.setAccessible(true); selected.set(null, false);
        var bundle = BundleLoader.class.getDeclaredField("bundle"); bundle.setAccessible(true); bundle.set(null, null);
    }
    private JSONObject patch(String version) throws Exception {
        byte[] bytes = ("bundle " + version).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        Files.write(new File(root, hash + ".bundle").toPath(), bytes);
        return new JSONObject().put("version", version).put("runtime", "plural-star-1.23.3-mods-1")
            .put("variant", "wallpaper-storage").put("bytes", bytes.length).put("sha256", hash);
    }
    private void write(String name, JSONObject data) throws Exception {
        Files.writeString(new File(root, name).toPath(), data.toString());
    }
    private String path(JSONObject patch) { return new File(root, patch.getString("sha256") + ".bundle").getAbsolutePath(); }

    @Test public void verifiedTrialIsPromotedAndConfirmedLaunchStaysInstalled() throws Exception {
        JSONObject next = patch("0.4.2"); write("pending.json", next);
        assertEquals(path(next), BundleLoader.getBundleFile(context));
        assertFalse(new File(root, "pending.json").exists());
        assertTrue(new File(root, "attempt.json").exists());
        write("healthy.json", new JSONObject().put("sha256", next.getString("sha256")));
        coldStart(); assertEquals(path(next), BundleLoader.getBundleFile(context));
        assertFalse(new File(root, "attempt.json").exists());
        coldStart(); assertEquals(path(next), BundleLoader.getBundleFile(context));
        assertFalse(new File(root, "failed.json").exists());
    }
    @Test public void failedTrialRollsBackAndCannotBeOfferedAgain() throws Exception {
        JSONObject old = patch("0.4.2"), bad = patch("0.4.3");
        write("active.json", old); write("pending.json", bad);
        assertEquals(path(bad), BundleLoader.getBundleFile(context));
        coldStart(); assertEquals(path(old), BundleLoader.getBundleFile(context));
        assertFalse(BundleLoader.valid(root, bad));
        assertFalse(new File(path(bad)).exists());
        write("pending.json", bad);
        coldStart(); assertEquals(path(old), BundleLoader.getBundleFile(context));
    }
    @Test public void failedFirstUpdateReturnsToEmbeddedBundle() throws Exception {
        write("pending.json", patch("0.4.2")); assertNotNull(BundleLoader.getBundleFile(context));
        coldStart(); assertNull(BundleLoader.getBundleFile(context));
        assertTrue(new File(root, "failed.json").exists());
    }
    @Test public void rejectsCorruptionWrongRuntimeWrongVariantAndOldVersion() throws Exception {
        JSONObject next = patch("0.4.2"); assertTrue(BundleLoader.valid(root, next));
        next.put("runtime", "other"); assertFalse(BundleLoader.valid(root, next));
        next.put("runtime", "plural-star-1.23.3-mods-1").put("variant", "storage"); assertFalse(BundleLoader.valid(root, next));
        next.put("variant", "wallpaper-storage").put("version", "0.4.1"); assertFalse(BundleLoader.valid(root, next));
        next.put("version", "9999999999999999999999999999.0.0"); assertFalse(BundleLoader.valid(root, next));
        next.put("version", "0.4.2"); Files.writeString(new File(path(next)).toPath(), "corruption");
        write("pending.json", next); assertNull(BundleLoader.getBundleFile(context));
    }
    @Test public void interruptedMetadataAndDownloadsDoNotPreventFutureUpdates() throws Exception {
        Files.writeString(new File(root, "pending.json").toPath(), "{partial");
        assertNull(BundleLoader.getBundleFile(context));
        JSONObject next = patch("0.4.2"); write("pending.json", next);
        coldStart(); assertEquals(path(next), BundleLoader.getBundleFile(context));
    }
    @Test public void newerEmbeddedAppIgnoresOlderDownloadedPatches() throws Exception {
        write("active.json", patch("0.3.9")); assertNull(BundleLoader.getBundleFile(context));
    }
}
