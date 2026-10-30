package dev.sparklecat.pluralmods;

import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Offline, version-locked bundle replacement. No native code or package identity is changed. */
public final class ApkPatcher {
    public static final String SOURCE_SHA256 = "0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f";
    public static final String BUNDLE = "assets/index.android.bundle";
    private static final long MAX_APK = 160L * 1024 * 1024;
    public interface Progress { void update(String message); }
    public interface Payload { InputStream open() throws IOException; }

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

    public static void patch(File source, File output, Payload payload, ApkSigner.SignerConfig signer, Progress progress) throws Exception {
        progress.update("Verifying the original APK…");
        if (source.length() > MAX_APK || !SOURCE_SHA256.equals(sha256(source)))
            throw new IOException("Choose the original Plural Star 1.23.3 app-release.apk from ByHanyou/Plural-Star. This APK does not match the supported release. Split APKs and already patched APKs are not supported.");
        File unsigned = new File(output.getParentFile(), "unsigned.tmp");
        File signed = new File(output.getParentFile(), "signed.tmp");
        try {
            progress.update("Applying selected mods…");
            rewrite(source, unsigned, payload);
            progress.update("Signing with this patcher's device key…");
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
            progress.update("Patched APK ready · signature verified");
        } finally { unsigned.delete(); signed.delete(); }
    }

    static boolean signatureEntry(String name) {
        String upper = name.toUpperCase(Locale.ROOT);
        return upper.startsWith("META-INF/") && (upper.equals("META-INF/MANIFEST.MF") || upper.endsWith(".SF") || upper.endsWith(".RSA") || upper.endsWith(".DSA") || upper.endsWith(".EC") || upper.startsWith("META-INF/SIG-"));
    }
    static void rewrite(File source, File output, Payload payload) throws IOException {
        try (ZipFile input = new ZipFile(source); CountingStream count = new CountingStream(new BufferedOutputStream(new FileOutputStream(output))); ZipOutputStream zip = new ZipOutputStream(count)) {
            Set<String> seen = new HashSet<>();
            boolean found = false;
            Enumeration<? extends ZipEntry> entries = input.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!seen.add(name)) throw new IOException("Duplicate APK entry.");
                if (signatureEntry(name)) continue;
                ZipEntry next = new ZipEntry(name);
                next.setTime(946684800000L); // Year 2000 stays in the DOS range in every timezone; avoid extended timestamps.
                if (name.equals(BUNDLE)) {
                    found = true;
                    zip.putNextEntry(next);
                    try (InputStream in = payload.open()) { copy(in, zip, 32L * 1024 * 1024); }
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
            if (!found) throw new IOException("The original APK has no React Native bundle.");
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
