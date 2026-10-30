package dev.sparklecat.pluralmods;

import com.android.apksig.*;
import org.junit.*;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.zip.*;

public class ApkPatcherTest {
    private File temp;
    @Before public void setup() throws Exception { temp = Files.createTempDirectory("plural-mods-test").toFile(); }
    @After public void cleanup() throws Exception {
        try (var paths = Files.walk(temp.toPath())) { paths.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete()); }
    }
    @Test public void rejectsUnknownApkWithoutPublishingOutput() throws Exception {
        File input = new File(temp, "bad.apk"), output = new File(temp, "out.apk");
        Files.write(input.toPath(), "unknown APK".getBytes(StandardCharsets.UTF_8));
        try { ApkPatcher.patch(input, output, () -> null, () -> null, null, note -> {}); fail("must reject"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("does not match")); }
        assertFalse(output.exists());
    }
    @Test public void replacesOnlyBundleAndOldSignatureFiles() throws Exception {
        File input = new File(temp, "input.zip"), output = new File(temp, "out.zip");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(input))) {
            for (String name : List.of(ApkPatcher.BUNDLE, "META-INF/CERT.RSA", "META-INF/CERT.SF", "META-INF/MANIFEST.MF", "META-INF/LICENSE", "classes.dex", "resources.arsc", "lib/x86_64/libexample.so")) {
                ZipEntry entry = new ZipEntry(name); byte[] bytes = name.getBytes(StandardCharsets.UTF_8);
                if (name.equals("resources.arsc") || name.endsWith(".so")) {
                    CRC32 crc = new CRC32(); crc.update(bytes);
                    entry.setMethod(ZipEntry.STORED); entry.setSize(bytes.length); entry.setCrc(crc.getValue());
                }
                zip.putNextEntry(entry); zip.write(bytes); zip.closeEntry();
            }
        }
        ApkPatcher.rewrite(input, output, () -> new ByteArrayInputStream("new bundle".getBytes(StandardCharsets.UTF_8)));
        try (ZipFile zip = new ZipFile(output)) {
            assertNull(zip.getEntry("META-INF/CERT.RSA")); assertNull(zip.getEntry("META-INF/CERT.SF")); assertNull(zip.getEntry("META-INF/MANIFEST.MF"));
            assertNotNull(zip.getEntry("META-INF/LICENSE"));
            assertEquals("new bundle", new String(zip.getInputStream(zip.getEntry(ApkPatcher.BUNDLE)).readAllBytes(), StandardCharsets.UTF_8));
            for (String name : List.of("classes.dex", "resources.arsc", "lib/x86_64/libexample.so"))
                assertEquals(name, new String(zip.getInputStream(zip.getEntry(name)).readAllBytes(), StandardCharsets.UTF_8));
        }
        // Inspect local header offsets: stored resources stay installable, libraries keep page alignment.
        try (RandomAccessFile file = new RandomAccessFile(output, "r")) {
            byte[] bytes = Files.readAllBytes(output.toPath());
            for (int i = 0; i < bytes.length - 30; i++) {
                if (bytes[i] != 0x50 || bytes[i+1] != 0x4b || bytes[i+2] != 3 || bytes[i+3] != 4) continue;
                int names = u16(bytes,i+26), extra = u16(bytes,i+28);
                String name = new String(bytes, i+30, names, StandardCharsets.UTF_8);
                if (name.equals("resources.arsc")) assertEquals(0, (i + 30 + names + extra) % 4);
                if (name.endsWith(".so")) assertEquals(0, (i + 30 + names + extra) % 16384);
            }
        }
    }
    private int u16(byte[] b, int i) { return (b[i] & 255) | (b[i+1] & 255) << 8; }

    @Test public void signsAndVerifiesAllThreeModsAgainstOfficialRelease() throws Exception {
        String apkPath = System.getenv("PLURAL_STAR_APK");
        Assume.assumeTrue("Set PLURAL_STAR_APK to run real-release integration", apkPath != null);
        File source = new File(apkPath);
        assertEquals(ApkPatcher.SOURCE_SHA256, ApkPatcher.sha256(source));
        File store = new File(temp, "test.jks");
        Process p = new ProcessBuilder(System.getProperty("java.home") + "/bin/keytool", "-genkeypair", "-alias", "test", "-keystore", store.toString(), "-storepass", "test-password", "-keypass", "test-password", "-keyalg", "RSA", "-keysize", "2048", "-dname", "CN=Test", "-validity", "3650").redirectErrorStream(true).start();
        p.getInputStream().readAllBytes(); assertEquals(0, p.waitFor());
        KeyStore keys = KeyStore.getInstance("PKCS12");
        try (InputStream in = new FileInputStream(store)) { keys.load(in, "test-password".toCharArray()); }
        var signer = new ApkSigner.SignerConfig.Builder("test", (PrivateKey) keys.getKey("test", "test-password".toCharArray()), List.of((X509Certificate) keys.getCertificate("test"))).build();
        File assets = new File("src/main/assets/payloads");
        for (String variant : List.of("wallpaper", "storage", "wallpaper-storage")) {
            File bundle = new File(assets, variant + ".bundle"), output = new File(temp, variant + ".apk");
            assertTrue(bundle.isFile());
            File nativeCode = new File(assets, variant + ".dex");
            ApkPatcher.patch(source, output, () -> new FileInputStream(bundle), () -> new FileInputStream(nativeCode), signer, note -> {});
            ApkVerifier.Result verification = new ApkVerifier.Builder(output).setMinCheckedPlatformVersion(24).build().verify();
            assertTrue(verification.getErrors().toString(), verification.isVerified());
            try (ZipFile before = new ZipFile(source); ZipFile after = new ZipFile(output)) {
                Enumeration<? extends ZipEntry> entries = before.entries();
                while (entries.hasMoreElements()) {
                    ZipEntry e = entries.nextElement();
                    if (e.getName().equals(ApkPatcher.BUNDLE) || e.getName().equals("classes2.dex") || ApkPatcher.signatureEntry(e.getName())) continue;
                    assertNotNull(e.getName(), after.getEntry(e.getName()));
                    assertArrayEquals(e.getName(), before.getInputStream(e).readAllBytes(), after.getInputStream(after.getEntry(e.getName())).readAllBytes());
                }
                assertArrayEquals(Files.readAllBytes(bundle.toPath()), after.getInputStream(after.getEntry(ApkPatcher.BUNDLE)).readAllBytes());
                assertArrayEquals(Files.readAllBytes(nativeCode.toPath()), after.getInputStream(after.getEntry("classes2.dex")).readAllBytes());
            }
        }
    }
}
