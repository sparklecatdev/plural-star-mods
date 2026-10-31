package dev.sparklecat.pluralmods;

import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Version-locked bundles installed by the patcher. Package identity is preserved. */
public final class ApkPatcher {
    public static final String SOURCE_SHA256 = "0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f";
    public static final String BUNDLE = "assets/index.android.bundle";
    public static final String PATCHER_MANAGED = "assets/sparklecat-patcher-managed";
    private static final long MAX_APK = 160L * 1024 * 1024;
    public interface Progress { void update(String message); }
    public interface Payload { InputStream open() throws IOException; }
    public interface Assets { InputStream open(String path) throws IOException; }

    public static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[65536]; int n;
            while ((n = in.read(bytes)) != -1) md.update(bytes, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
        return hex.toString();
    }

    public static void patch(File source, File output, Payload payload, Payload nativeCode, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        patch(source, output, SOURCE_SHA256, payload, nativeCode, signer, progress);
    }
    public static void patch(File source, File output, String expectedSha256, Payload payload, Payload nativeCode, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        patch(source, output, expectedSha256, payload, nativeCode, null, signer, progress);
    }
    public static void patch(File source, File output, String expectedSha256, Payload payload, Payload nativeCode, Payload primaryNativeCode, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        patch(source, output, expectedSha256, payload, nativeCode, primaryNativeCode, Collections.emptyMap(), signer, progress);
    }
    public static void patch(File source, File output, String expectedSha256, Payload payload, Payload nativeCode, Payload primaryNativeCode, Map<String, byte[]> iconFiles, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        patch(source, output, expectedSha256, payload, nativeCode, primaryNativeCode, iconFiles, null, signer, progress);
    }
    public static void patch(File source, File output, String expectedSha256, Payload payload, Payload nativeCode, Payload primaryNativeCode, Map<String, byte[]> iconFiles, Assets discord, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        progress.update("Verifying the original APK…");
        if (expectedSha256 == null || !expectedSha256.matches("[0-9a-f]{64}") || source.length() > MAX_APK || !expectedSha256.equals(sha256(source)))
            throw new IOException("This APK does not match the supported release. Use Download Plural Star to get a compatible official copy.");
        File unsigned = new File(output.getParentFile(), "unsigned.tmp");
        File signed = new File(output.getParentFile(), "signed.tmp");
        try {
            progress.update("Applying mods…");
            if (nativeCode == null) throw new IOException("The patch update loader is missing.");
            rewrite(source, unsigned, payload, nativeCode, primaryNativeCode, iconFiles, discord);
            progress.update("Preparing the app for installation…");
            new ApkSigner.Builder(Collections.singletonList(signer)).setInputApk(unsigned).setOutputApk(signed)
                .setMinSdkVersion(24).setV1SigningEnabled(false).setV2SigningEnabled(true).setV3SigningEnabled(false)
                .setOtherSignersSignaturesPreserved(false).build().sign();
            ApkVerifier.Result check = new ApkVerifier.Builder(signed).setMinCheckedPlatformVersion(24).build().verify();
            if (!check.isVerified()) throw new IOException("Generated APK failed signature verification: " + check.getErrors());
            try (ZipFile zip = new ZipFile(signed)) {
                if (zip.getEntry(BUNDLE) == null) throw new IOException("Generated APK has no app bundle.");
            }
            if (output.exists() && !output.delete()) throw new IOException("Could not replace previous output.");
            if (!signed.renameTo(output)) throw new IOException("Could not publish generated APK.");
            progress.update("Ready to install · verified");
        } finally { unsigned.delete(); signed.delete(); }
    }

    static boolean signatureEntry(String name) {
        String upper = name.toUpperCase(Locale.ROOT);
        return upper.startsWith("META-INF/") && (upper.equals("META-INF/MANIFEST.MF") || upper.endsWith(".SF") || upper.endsWith(".RSA") || upper.endsWith(".DSA") || upper.endsWith(".EC") || upper.startsWith("META-INF/SIG-"));
    }
    static void rewrite(File source, File output, Payload payload) throws IOException {
        rewrite(source, output, payload, null);
    }
    static void rewrite(File source, File output, Payload payload, Payload nativeCode) throws IOException {
        rewrite(source, output, payload, nativeCode, null);
    }
    static void rewrite(File source, File output, Payload payload, Payload nativeCode, Payload primaryNativeCode) throws IOException {
        rewrite(source, output, payload, nativeCode, primaryNativeCode, Collections.emptyMap());
    }
    static void rewrite(File source, File output, Payload payload, Payload nativeCode, Payload primaryNativeCode, Map<String, byte[]> iconFiles) throws IOException {
        rewrite(source, output, payload, nativeCode, primaryNativeCode, iconFiles, null);
    }
    static void rewrite(File source, File output, Payload payload, Payload nativeCode, Payload primaryNativeCode, Map<String, byte[]> iconFiles, Assets discord) throws IOException {
        try (ZipFile input = new ZipFile(source); CountingStream count = new CountingStream(new BufferedOutputStream(new FileOutputStream(output))); ZipOutputStream zip = new ZipOutputStream(count)) {
            Set<String> seen = new HashSet<>();
            boolean found = false, foundNative = false, foundPrimary = false;
            Set<String> remainingIcons = new HashSet<>(iconFiles.keySet());
            Enumeration<? extends ZipEntry> entries = input.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!seen.add(name)) throw new IOException("Duplicate APK entry.");
                if (signatureEntry(name)) continue;
                ZipEntry next = new ZipEntry(name);
                next.setTime(946684800000L); // Year 2000 stays in the DOS range in every timezone; avoid extended timestamps.
                if (iconFiles.containsKey(name)) {
                    remainingIcons.remove(name);
                    zip.putNextEntry(next);
                    zip.write(iconFiles.get(name));
                } else if (discord != null && name.equals("AndroidManifest.xml")) {
                    zip.putNextEntry(next);
                    try (InputStream in = input.getInputStream(entry); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                        copy(in, bytes, 4L * 1024 * 1024);
                        zip.write(DiscordManifest.addQueries(bytes.toByteArray()));
                    }
                } else if (name.equals(BUNDLE) || name.equals("classes2.dex") && nativeCode != null || name.equals("classes.dex") && primaryNativeCode != null) {
                    boolean isBundle = name.equals(BUNDLE);
                    boolean isPrimary = name.equals("classes.dex");
                    if (isBundle) found = true; else if (isPrimary) foundPrimary = true; else foundNative = true;
                    zip.putNextEntry(next);
                    try (InputStream in = (isBundle ? payload : isPrimary ? primaryNativeCode : nativeCode).open()) { copy(in, zip, 32L * 1024 * 1024); }
                } else {
                    next.setMethod(entry.getMethod());
                    if (entry.getMethod() == ZipEntry.STORED) {
                        next.setSize(entry.getSize()); next.setCrc(entry.getCrc());
                        // Android requires resources.arsc aligned to 4 bytes. Stored native libraries get 16 KiB alignment.
                        int alignment = name.startsWith("lib/") && name.endsWith(".so") ? 16384 : 4;
                        int pad = (int) ((alignment - (count.count + 30 + name.getBytes(StandardCharsets.UTF_8).length) % alignment) % alignment);
                        if (pad > 0) {
                            if (pad < 4) pad += alignment;
                            byte[] extra = new byte[pad]; extra[0] = 0x35; extra[1] = (byte) 0xD9;
                            extra[2] = (byte) (pad - 4); extra[3] = (byte) ((pad - 4) >> 8);
                            next.setExtra(extra);
                        }
                    }
                    zip.putNextEntry(next);
                    try (InputStream in = input.getInputStream(entry)) { copy(in, zip, MAX_APK); }
                }
                zip.closeEntry();
            }
            if (discord != null) {
                int dex = 2;
                while (seen.contains("classes" + dex + ".dex")) dex++;
                writeAsset(zip, count, "classes" + dex + ".dex", discord, "classes.dex");
                for (String abi : new String[] {"arm64-v8a", "armeabi-v7a", "x86", "x86_64"}) {
                    boolean present = false;
                    for (String path : seen) if (path.startsWith("lib/" + abi + "/")) { present = true; break; }
                    if (!present) continue;
                    for (String lib : new String[] {"libdiscord_partner_sdk.so", "libsparklecat_discord.so"}) {
                        String path = "lib/" + abi + "/" + lib;
                        if (seen.contains(path)) throw new IOException("Unexpected Discord library already exists.");
                        writeAsset(zip, count, path, discord, abi + "/" + lib);
                    }
                }
            }
            if (nativeCode != null) {
                zip.putNextEntry(new ZipEntry(PATCHER_MANAGED));
                zip.write(1);
                zip.closeEntry();
            }
            if (!remainingIcons.isEmpty()) throw new IOException("The original APK is missing its launcher icon.");
            if (!found) throw new IOException("The original APK has no React Native bundle.");
            if (nativeCode != null && !foundNative) throw new IOException("The original APK has no supported native host.");
            if (primaryNativeCode != null && !foundPrimary) throw new IOException("The original APK has no primary native code.");
        }
    }
    private static void writeAsset(ZipOutputStream zip, CountingStream count, String path, Assets assets, String asset) throws IOException {
        ZipEntry entry = new ZipEntry(path);
        entry.setTime(946684800000L);
        try (InputStream in = assets.open(asset); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            copy(in, buffer, 32L * 1024 * 1024);
            byte[] data = buffer.toByteArray();
            if (path.endsWith(".so")) {
                CRC32 crc = new CRC32(); crc.update(data);
                entry.setMethod(ZipEntry.STORED); entry.setSize(data.length); entry.setCrc(crc.getValue());
                int pad = (int) ((16384 - (count.count + 30 + path.getBytes(StandardCharsets.UTF_8).length) % 16384) % 16384);
                if (pad > 0) {
                    if (pad < 4) pad += 16384;
                    byte[] extra = new byte[pad]; extra[0] = 0x35; extra[1] = (byte) 0xD9;
                    extra[2] = (byte) (pad - 4); extra[3] = (byte) ((pad - 4) >> 8); entry.setExtra(extra);
                }
            }
            zip.putNextEntry(entry); zip.write(data); zip.closeEntry();
        }
    }
    public static long copy(InputStream in, OutputStream out, long max) throws IOException {
        byte[] bytes = new byte[65536]; long total = 0; int n;
        while ((n = in.read(bytes)) != -1) {
            total += n; if (total > max) throw new IOException("File exceeds the supported size limit.");
            out.write(bytes, 0, n);
        }
        return total;
    }
    static final class CountingStream extends FilterOutputStream {
        long count;
        CountingStream(OutputStream out) { super(out); }
        @Override public void write(int b) throws IOException { out.write(b); count++; }
        @Override public void write(byte[] b, int off, int len) throws IOException { out.write(b, off, len); count += len; }
    }
}
