package dev.sparklecat.updates;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;
import org.json.JSONObject;

/** Private, version-locked OTA bundles. A failed launch falls back before JS starts. */
public final class BundleLoader {
    private static final String RUNTIME = "@RUNTIME@", VARIANT = "@VARIANT@", VERSION = "@VERSION@";
    private static boolean selected;
    private static String bundle;

    public static synchronized String getBundleFile(Context context) {
        if (selected) return bundle;
        selected = true;
        File root = new File(context.getFilesDir(), "sparklecat-updates");
        try {
            if (!root.isDirectory() && !root.mkdirs()) return null;
            JSONObject attempt = read(root, "attempt.json");
            JSONObject healthy = read(root, "healthy.json");
            if (attempt != null && (healthy == null || !attempt.optString("sha256").equals(healthy.optString("sha256")))) {
                // Keep the failed hash so another check cannot silently offer the same bad bundle.
                write(root, "failed.json", attempt);
                JSONObject previous = read(root, "previous.json");
                if (previous == null) remove(root, "active.json"); else write(root, "active.json", previous);
            }
            remove(root, "attempt.json");
            JSONObject active = read(root, "active.json"), pending = read(root, "pending.json");
            if (pending != null) {
                if (valid(root, pending)) {
                    if (active == null) remove(root, "previous.json"); else write(root, "previous.json", active);
                    // Record the trial before promotion, so an interrupted launch also rolls back.
                    remove(root, "healthy.json");
                    write(root, "attempt.json", pending);
                    write(root, "active.json", pending);
                    active = pending;
                }
                remove(root, "pending.json");
            }
            if (active != null && valid(root, active)) {
                bundle = new File(root, active.getString("sha256") + ".bundle").getAbsolutePath();
            }
            // Keep the current and previous bundles for rollback; discard older downloads.
            JSONObject previous = read(root, "previous.json");
            File[] files = root.listFiles();
            if (files != null) for (File file : files) {
                String name = file.getName();
                if (name.matches("[0-9a-f]{64}\\.bundle") &&
                    (active == null || !name.equals(active.optString("sha256") + ".bundle")) &&
                    (previous == null || !name.equals(previous.optString("sha256") + ".bundle"))) file.delete();
            }
        } catch (Exception ignored) { bundle = null; /* Embedded bundle remains usable offline. */ }
        return bundle;
    }

    static boolean valid(File root, JSONObject value) throws Exception {
        String hash = value.optString("sha256"), version = value.optString("version");
        if (!hash.matches("[0-9a-f]{64}") || !RUNTIME.equals(value.optString("runtime")) || !VARIANT.equals(value.optString("variant"))) return false;
        if (!version.matches("(0|[1-9][0-9]{0,15})\\.(0|[1-9][0-9]{0,15})\\.(0|[1-9][0-9]{0,15})") || compare(version, VERSION) <= 0) return false;
        JSONObject failed = read(root, "failed.json");
        if (failed != null && hash.equals(failed.optString("sha256"))) return false;
        File file = new File(root, hash + ".bundle");
        if (!file.isFile() || file.length() != value.optLong("bytes") || file.length() < 1 || file.length() > 32L * 1024 * 1024) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[65536]; int n;
            while ((n = in.read(bytes)) != -1) digest.update(bytes, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
        return hash.equals(hex.toString());
    }

    private static int compare(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int n = Long.compare(Long.parseLong(x[i]), Long.parseLong(y[i]));
            if (n != 0) return n;
        }
        return 0;
    }
    private static JSONObject read(File root, String name) throws Exception {
        File file = new File(root, name);
        if (!file.isFile()) return null;
        if (file.length() > 4096) { remove(root, name); return null; }
        try { return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)); }
        catch (org.json.JSONException e) { remove(root, name); return null; }
    }
    private static void write(File root, String name, JSONObject data) throws Exception {
        File temp = new File(root, name + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(data.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync();
        }
        Files.move(temp.toPath(), new File(root, name).toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
    private static void remove(File root, String name) throws IOException {
        File file = new File(root, name);
        if (file.exists() && !file.delete()) throw new IOException("Could not clear update state");
    }
}
