package dev.sparklecat.pluralmods;

import android.content.Context;
import android.content.pm.*;
import android.os.Build;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/** Public HTTPS releases only. Downloads stay private until hash, package and signer checks pass. */
public final class UpdateClient {
    private final Context context;
    public interface Progress { void update(String message); }
    public UpdateClient(Context context) { this.context = context.getApplicationContext(); }
    public File downloadOriginal(Progress progress) throws Exception {
        CompatibilityPack.Asset release = CompatibilityPack.latestOriginal(readText(CompatibilityPack.LATEST_API, 1024 * 1024, true));
        File target = new File(context.getCacheDir(), "official-download.apk");
        try {
            progress.update("Downloading Plural Star " + release.version + "…");
            downloadAsset(release, target);
            return target;
        } catch (Exception e) { target.delete(); throw e; }
    }
    private void downloadAsset(CompatibilityPack.Asset asset, File target) throws Exception {
        HttpsURLConnection connection = connect(asset.url, false);
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            ApkPatcher.copy(in, out, asset.bytes);
        } finally { connection.disconnect(); }
        UpdateTrust.checkDownload(target, asset.bytes, asset.sha256);
    }
    public CompatibilityPack cachedCompatibility(File original) throws Exception {
        if (!original.isFile()) return null;
        return cachedCompatibility(ApkPatcher.sha256(original));
    }
    private CompatibilityPack cachedCompatibility(String base) throws Exception {
        if (ApkPatcher.SOURCE_SHA256.equals(base)) return null;
        File[] files = context.getFilesDir().listFiles();
        CompatibilityPack best = null;
        if (files != null) for (File file : files) {
            String prefix = "compat-" + base + "-";
            if (!file.getName().matches(prefix + "[0-9a-f]{64}\\.zip")) continue;
            try {
                String hash = file.getName().substring(prefix.length(), prefix.length() + 64);
                if (!ApkPatcher.sha256(file).equals(hash)) continue;
                CompatibilityPack pack = CompatibilityPack.read(file, base, null);
                if (best == null || ReleaseVersion.parse(pack.info.getString("version")).compareTo(ReleaseVersion.parse(best.info.getString("version"))) > 0) best = pack;
            } catch (Exception invalid) { /* Ignore incomplete or damaged cache files. */ }
        }
        return best;
    }
    public CompatibilityPack compatibility(File original, Progress progress) throws Exception {
        String base = ApkPatcher.sha256(original);
        if (ApkPatcher.SOURCE_SHA256.equals(base)) return null;
        CompatibilityPack cached = cachedCompatibility(base);
        try {
            progress.update("Checking compatibility…");
            CompatibilityPack.Asset asset = CompatibilityPack.select(readText(UpdatePolicy.API, 1024 * 1024, true), base);
            if (asset == null) {
                if (cached != null) return cached;
                throw new IOException("No tested patches are available for this APK yet. New official releases are checked automatically; try again later or report a compatibility issue.");
            }
            if (cached != null && ReleaseVersion.parse(cached.info.getString("version")).compareTo(ReleaseVersion.parse(asset.version)) >= 0) return cached;
            File target = new File(context.getFilesDir(), "compat-" + base + "-" + asset.sha256 + ".zip");
            File temporary = new File(context.getFilesDir(), "compat-download.part");
            try {
                progress.update("Downloading matching patches…");
                downloadAsset(asset, temporary);
                CompatibilityPack.read(temporary, base, asset.version);
                java.nio.file.Files.move(temporary.toPath(), target.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                return CompatibilityPack.read(target, base, asset.version);
            } finally { temporary.delete(); }
        } catch (Exception e) {
            if (cached != null) return cached;
            throw e;
        }
    }
    public File updateFile() { return new File(context.getFilesDir(), "self-update.apk"); }
    public UpdatePolicy.Release check(boolean previews) throws Exception {
        return UpdatePolicy.select(readText(UpdatePolicy.API, 1024 * 1024, true), BuildConfig.VERSION_NAME, previews);
    }
    public UpdatePolicy.PatchRelease checkPatch(String version, String runtime, String variant) throws Exception {
        return UpdatePolicy.selectPatch(readText(UpdatePolicy.API, 1024 * 1024, true), version, runtime, variant);
    }
    public File downloadPatch(UpdatePolicy.PatchRelease release, Progress progress) throws Exception {
        File target = new File(context.getFilesDir(), "patch-" + release.sha256 + ".bundle");
        if (target.isFile()) {
            try { UpdateTrust.checkDownload(target, release.bytes, release.sha256); return target; }
            catch (IOException invalid) { if (!target.delete()) throw invalid; }
        }
        File temporary = new File(context.getFilesDir(), "patch-download.part");
        try {
            progress.update("Downloading patches " + release.version.name + "…");
            HttpsURLConnection connection = connect(release.url, false);
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(temporary)) {
                ApkPatcher.copy(in, out, release.bytes);
            } finally { connection.disconnect(); }
            UpdateTrust.checkDownload(temporary, release.bytes, release.sha256);
            if (!temporary.renameTo(target)) throw new IOException("Could not save verified patches.");
            File[] files = context.getFilesDir().listFiles();
            if (files != null) for (File file : files) {
                if (file.getName().matches("patch-[0-9a-f]{64}\\.bundle") && !file.equals(target)) file.delete();
            }
            return target;
        } finally { temporary.delete(); }
    }
    public File download(UpdatePolicy.Release release, Progress progress) throws Exception {
        String hash = UpdatePolicy.checksum(readText(release.checksumsUrl, 64 * 1024, false), release.filename);
        File temporary = new File(context.getFilesDir(), "self-update.part.apk");
        try {
            progress.update("Downloading v" + release.version.name + "…");
            HttpsURLConnection connection = connect(release.apkUrl, false);
            long count = 0, last = 0;
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(temporary)) {
                byte[] bytes = new byte[65536]; int n;
                while ((n = in.read(bytes)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Download canceled.");
                    count += n;
                    if (count > release.bytes || count > UpdatePolicy.MAX_APK) throw new IOException("Update exceeds its published size.");
                    out.write(bytes, 0, n);
                    long now = System.currentTimeMillis();
                    if (now - last >= 250) { progress.update("Downloading update · " + (count * 100 / release.bytes) + "%"); last = now; }
                }
            } finally { connection.disconnect(); }
            UpdateTrust.checkDownload(temporary, release.bytes, hash);
            progress.update("Verifying update…");
            verify(temporary, release);
            File target = updateFile();
            if (target.exists() && !target.delete()) throw new IOException("Could not replace the previous download.");
            if (!temporary.renameTo(target)) throw new IOException("Could not save the verified update.");
            return target;
        } finally { temporary.delete(); }
    }
    public String verify(File file, UpdatePolicy.Release release) throws Exception {
        if (!file.isFile() || file.length() < 1 || file.length() > UpdatePolicy.MAX_APK) throw new IOException("No complete update is downloaded.");
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), flags);
        Signature[] current = Build.VERSION.SDK_INT >= 28 ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        UpdateTrust.checkSigner(file, current == null ? null : Arrays.stream(current).map(Signature::toByteArray).toArray(byte[][]::new));
        PackageInfo candidate = pm.getPackageArchiveInfo(file.getAbsolutePath(), 0);
        UpdateTrust.checkPackage(candidate == null ? null : candidate.packageName, context.getPackageName());
        long currentCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        long candidateCode = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        UpdatePolicy.checkVersion(candidate.versionName, candidateCode, installed.versionName, currentCode, release);
        return candidate.versionName;
    }
    private String readText(String url, long limit, boolean api) throws Exception {
        HttpsURLConnection connection = connect(url, api);
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ApkPatcher.copy(in, out, limit);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally { connection.disconnect(); }
    }
    private static HttpsURLConnection connect(String value, boolean api) throws Exception {
        URI uri = URI.create(value);
        for (int redirects = 0; redirects <= 5; redirects++) {
            boolean allowed = api ? "https".equals(uri.getScheme()) && "api.github.com".equals(uri.getHost()) && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                : UpdatePolicy.downloadUrlAllowed(uri);
            if (!allowed) throw new IOException("Download redirected outside the trusted HTTPS hosts.");
            HttpsURLConnection c = (HttpsURLConnection) uri.toURL().openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "sparklecat-plural-star-mods/" + BuildConfig.VERSION_NAME);
            c.setRequestProperty("Accept", api ? "application/vnd.github+json" : "application/octet-stream");
            if (api) c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            int status;
            try { status = c.getResponseCode(); } catch (Exception e) { c.disconnect(); throw e; }
            if (status == 200) return c;
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = c.getHeaderField("Location"); c.disconnect();
                if (location == null) throw new IOException("Download redirect has no destination.");
                uri = uri.resolve(location); continue;
            }
            c.disconnect();
            if (status == 403 || status == 429) throw new IOException("GitHub is limiting requests. Try again later.");
            throw new IOException("Download server returned HTTP " + status + ". Try again later.");
        }
        throw new IOException("Too many download redirects.");
    }
}
