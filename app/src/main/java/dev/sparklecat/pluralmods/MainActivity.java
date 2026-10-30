package dev.sparklecat.pluralmods;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.Arrays;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int PICK_APK = 10, SAVE_APK = 11, SAVE_SOURCE = 12, ALLOW_SELF_UPDATE = 13, ALLOW_INSTALL = 14;
    private static final int BG = Color.rgb(20,16,31), CARD = Color.rgb(36,27,51), INK = Color.rgb(255,246,255), MUTED = Color.rgb(197,185,212), ACCENT = Color.rgb(229,181,255);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService updateWorker = Executors.newSingleThreadExecutor();
    private final java.util.List<View> controls = new java.util.ArrayList<>();
    private LinearLayout content;
    private TextView status, selected;
    private Button patch, install, save, checkUpdates;
    private ProgressBar progress;
    private boolean busy;
    private File source, output;
    private UpdateClient updater;
    private TextView updateStatus;
    private CheckBox previewUpdates;
    private ProgressBar updateProgress;
    private LinearLayout updateCard, patchCard;
    private TextView patchStatus;
    private ScrollView mainScroll;
    private String downloadedVersion, promptedVersion;
    private long lastUpdateCheck;
    private boolean updateBusy, checkingPatches, resumed;
    private volatile boolean destroyed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        source = new File(getFilesDir(), "original.apk"); output = new File(getFilesDir(), "patched.apk");
        updater = new UpdateClient(this);
        ScrollView scroll = new ScrollView(this); scroll.setBackgroundColor(BG); scroll.setFillViewport(true);
        mainScroll = scroll;
        content = column(); content.setPadding(dp(24), dp(28), dp(24), dp(32)); scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(scroll);
        text(content, "✦  ฅ^•ﻌ•^ฅ", 37, ACCENT, true);
        text(content, "sparklecat's\nplural star mods", 31, INK, true);
        text(content, "Get Plural Star with all mods included.", 16, MUTED, false);

        LinearLayout first = card("01", "Get Plural Star");
        text(first, "Download the latest official release, choose an APK, or use the app already on your device. Matching patches are fetched automatically.", 15, MUTED, false);
        button(first, "Download latest Plural Star", () -> work("Checking the latest release…", () -> {
            File download = updater.downloadOriginal(note -> updateUi(() -> status.setText(note)));
            try { importApk(new FileInputStream(download)); } finally { download.delete(); }
        }));
        button(first, "Choose APK file", () -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(intent, PICK_APK);
        });
        button(first, "Use installed Plural Star", this::useInstalled);
        selected = text(first, source.exists() ? "Plural Star is ready" : "Choose an option above to get started", 13, ACCENT, false);

        LinearLayout build = card("02", "Install and update mods");
        patchCard = build;
        text(build, "Includes wallpaper, storage tools, and PluralKit front sync. Manage them in Settings → sparklecat's mods after installing.", 15, MUTED, false);
        patchStatus = text(build, "New patches are fetched here without updating the patcher.", 14, ACCENT, false);
        patch = button(build, "Prepare and install", this::build);
        progress = new ProgressBar(this); progress.setVisibility(View.GONE); build.addView(progress);
        status = text(build, output.exists() ? "Your previous build is ready to install." : "Mods are applied on your device. Android will ask you to confirm installation.", 14, MUTED, false);
        int lastPatch = getPreferences(0).getInt("last_patch_version", 0);
        if (source.exists() && lastPatch > 0 && lastPatch < BuildConfig.VERSION_CODE) {
            patch.setText("Update installed mods");
            status.setText("New mods are available. Prepare and install them using your saved copy of Plural Star.");
        }
        install = button(build, "Install prepared app", this::install);
        save = button(build, "Save patched APK", () -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/vnd.android.package-archive")
            .putExtra(Intent.EXTRA_TITLE, "plural-star-sparklecat-mods.apk"), SAVE_APK));

        LinearLayout data = card("", "Your data");
        text(data, "Already using Plural Star? Export your data and media and check your backup before replacing the official app. Uninstalling it deletes its private data. Import the backup after installing the modded app.", 15, MUTED, false);
        text(data, "Keep this patcher installed and retain its app data so future mods can update your app with the same signing key.", 14, MUTED, false);
        button(data, "Open Plural Star", this::openPluralStar);

        updateCard = card("", "Patcher updates");
        text(updateCard, "Version " + BuildConfig.VERSION_NAME, 13, ACCENT, false);
        updateStatus = text(updateCard, "Updates are verified before Android asks you to install them.", 14, MUTED, false);
        previewUpdates = updatePreference(updateCard, "Include preview releases", "preview_updates", true);
        checkUpdates = button(updateCard, "Check for updates", () -> {
            promptedVersion = null;
            checkPatchUpdates();
            checkForUpdates();
        });
        text(updateCard, "Checks for patcher and mod updates.", 13, MUTED, false);
        updateProgress = new ProgressBar(this); updateProgress.setVisibility(View.GONE); updateCard.addView(updateProgress);
        button(content, "Save mod source code", () -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip").putExtra(Intent.EXTRA_TITLE, "plural-star-mods-source.zip"), SAVE_SOURCE));
        button(content, "Plural Star project ↗", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/ByHanyou/Plural-Star"))));
        text(content, "Independent mods · AGPL-3.0\nPlural Star by TheHanyou, SPARKLECATDEV, and contributors", 12, MUTED, false);
        refresh();
        checkPatchUpdates();
        handleUpdateLink(getIntent());
    }
    private LinearLayout column() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); return l; }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private TextView text(LinearLayout parent, String value, int size, int color, boolean bold) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0,dp(5),0,dp(10)); view.setLineSpacing(dp(3),1);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        parent.addView(view); return view;
    }
    private LinearLayout card(String number, String title) {
        LinearLayout l = column(); l.setPadding(dp(18),dp(16),dp(18),dp(16));
        GradientDrawable background = new GradientDrawable(); background.setColor(CARD); background.setCornerRadius(dp(20)); l.setBackground(background);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,-2); p.topMargin = dp(20); content.addView(l,p);
        text(l, number.isEmpty() ? title : number + "  /  " + title, 21, INK, true); return l;
    }
    private Button button(LinearLayout parent, String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextColor(INK); b.setTextSize(15); b.setMinHeight(dp(52));
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(92,65,125)));
        b.setOnClickListener(v -> { try { action.run(); } catch (Exception e) { message(e.getMessage()); } });
        parent.addView(b, new LinearLayout.LayoutParams(-1,-2)); controls.add(b); return b;
    }
    private void message(String s) { new AlertDialog.Builder(this).setTitle("sparklecat's mods").setMessage(s == null ? "Operation failed." : s).setPositiveButton("OK", null).show(); }
    private void refresh() {
        for (View c : controls) c.setEnabled(!busy);
        patch.setEnabled(!busy && source.exists());
        save.setEnabled(!busy && output.exists()); install.setEnabled(!busy && output.exists());
        save.setVisibility(output.exists() ? View.VISIBLE : View.GONE); install.setVisibility(output.exists() ? View.VISIBLE : View.GONE);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        refreshUpdates();
    }
    private CheckBox updatePreference(LinearLayout parent, String label, String key, boolean fallback) {
        CheckBox view = new CheckBox(this); view.setText(label); view.setTextColor(INK); view.setMinHeight(dp(48));
        view.setChecked(getPreferences(0).getBoolean(key, fallback)); parent.addView(view); controls.add(view);
        view.setOnCheckedChangeListener((button, value) -> {
            getPreferences(0).edit().putBoolean(key, value).apply();
            downloadedVersion = null;
            checkForUpdates();
        });
        return view;
    }
    private void refreshUpdates() {
        if (previewUpdates == null) return;
        previewUpdates.setEnabled(!busy && !updateBusy);
        checkUpdates.setEnabled(!busy && !updateBusy && !checkingPatches);
        updateProgress.setVisibility(updateBusy || checkingPatches ? View.VISIBLE : View.GONE);
    }
    private void updateUi(Runnable action) { runOnUiThread(() -> { if (!destroyed) action.run(); }); }
    private void updateWork(String label, CheckedAction action) {
        if (destroyed || updateBusy) return;
        updateBusy = true; updateStatus.setText(label); refresh();
        updateWorker.execute(() -> {
            try { action.run(); }
            catch (Exception e) { updateUi(() -> updateStatus.setText("Update unavailable: " + e.getMessage())); }
            finally { updateUi(() -> { updateBusy = false; refresh(); maybePromptUpdate(); }); }
        });
    }
    private void maybeCheckAutomatically() {
        if (previewUpdates == null || updateBusy || destroyed) return;
        long now = System.currentTimeMillis();
        if (lastUpdateCheck == 0 || now < lastUpdateCheck || now - lastUpdateCheck >= 15L * 60 * 1000) checkForUpdates();
    }
    private void checkForUpdates() {
        if (updateBusy || destroyed) return;
        boolean previews = previewUpdates.isChecked();
        lastUpdateCheck = System.currentTimeMillis();
        updateWork("Checking for updates…", () -> {
            UpdatePolicy.Release release = updater.check(previews);
            if (release == null) {
                updateUi(() -> { downloadedVersion = null; updateStatus.setText("You're up to date. Updates are checked automatically."); });
                return;
            }
            try {
                updater.verify(updater.updateFile(), release);
            } catch (Exception invalid) {
                updater.download(release, note -> updateUi(() -> updateStatus.setText(note)));
            }
            updateUi(() -> {
                downloadedVersion = release.version.name;
                updateStatus.setText("Update v" + downloadedVersion + " verified. Installation will be offered when you're ready.");
            });
        });
    }
    private void maybePromptUpdate() {
        if (destroyed || !resumed || busy || updateBusy || downloadedVersion == null
                || downloadedVersion.equals(promptedVersion) || !getWindow().getDecorView().hasWindowFocus()) return;
        promptedVersion = downloadedVersion;
        new AlertDialog.Builder(this).setTitle("Patcher update ready")
            .setMessage("Version " + downloadedVersion + " has been downloaded and verified. Install it now?")
            .setNegativeButton("Later", null)
            .setPositiveButton("Install", (dialog, which) -> installSelfUpdate()).show();
    }
    private void installSelfUpdate() {
        updateWork("Verifying downloaded update…", () -> {
            String version = updater.verify(updater.updateFile(), null);
            updateUi(() -> { downloadedVersion = version; openSelfInstaller(); });
        });
    }
    private void openSelfInstaller() {
        if (!resumed || busy) { promptedVersion = null; return; }
        if (!getPackageManager().canRequestPackageInstalls()) {
            updateStatus.setText("Allow installs from this app, then return to install the update.");
            startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())), ALLOW_SELF_UPDATE);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(ApkProvider.UPDATE_URI, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("Verified app update", ApkProvider.UPDATE_URI));
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) { message("No Android package installer is available on this device."); }
    }
    private void handleUpdateLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "sparklecatmods".equals(data.getScheme()) && "patches".equals(data.getHost())) {
            mainScroll.post(() -> mainScroll.smoothScrollTo(0, patchCard.getTop()));
            checkPatchUpdates();
        }
        if (data != null && "sparklecatmods".equals(data.getScheme()) && "updates".equals(data.getHost())) {
            mainScroll.post(() -> mainScroll.smoothScrollTo(0, updateCard.getTop()));
            checkForUpdates();
        }
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleUpdateLink(intent); }
    @Override protected void onResume() { super.onResume(); resumed = true; maybeCheckAutomatically(); maybePromptUpdate(); }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) maybePromptUpdate(); }
    @Override protected void onPause() { resumed = false; super.onPause(); }
    private void work(String label, CheckedAction action) {
        work(label, action, this::maybePromptUpdate);
    }
    private void work(String label, CheckedAction action, Runnable completed) {
        if (busy || destroyed) return;
        busy = true; status.setText(label); refresh();
        worker.execute(() -> {
            boolean success = false;
            try { action.run(); success = true; }
            catch (Exception e) { updateUi(() -> status.setText("Could not finish: " + e.getMessage())); }
            finally {
                boolean ready = success;
                updateUi(() -> { busy = false; refresh(); if (ready && resumed) completed.run(); else maybePromptUpdate(); });
            }
        });
    }
    interface CheckedAction { void run() throws Exception; }
    private void importApk(InputStream input) throws Exception {
        if (input == null) throw new IOException("Could not open the selected file.");
        File temporary = new File(getCacheDir(), "import.apk");
        try {
            try (InputStream in = input; OutputStream out = new FileOutputStream(temporary)) { ApkPatcher.copy(in, out, 160L * 1024 * 1024); }
            updater.compatibility(temporary, note -> updateUi(() -> status.setText(note)));
            java.nio.file.Files.move(temporary.toPath(), source.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            output.delete();
            updateUi(() -> { selected.setText("Plural Star is ready · verified official copy"); status.setText("Tap Prepare and install to continue."); });
        } finally { temporary.delete(); }
    }
    private void useInstalled() {
        work("Reading installed APK…", () -> {
            ApplicationInfo app;
            try { app = getPackageManager().getApplicationInfo("com.pluralspace.app", 0); }
            catch (PackageManager.NameNotFoundException e) { throw new IOException("Plural Star is not installed. Download it or choose an APK file."); }
            if (app.splitSourceDirs != null && app.splitSourceDirs.length > 0) throw new IOException("This installation uses split APKs. Use Download Plural Star instead.");
            importApk(new FileInputStream(app.sourceDir));
        });
    }
    private org.json.JSONObject payloadInfo() throws Exception {
        CompatibilityPack pack = updater.cachedCompatibility(source);
        if (pack != null) return pack.info;
        if (source.isFile() && !ApkPatcher.SOURCE_SHA256.equals(ApkPatcher.sha256(source)))
            throw new IOException("Download matching patches before preparing this APK.");
        return embeddedInfo();
    }
    private org.json.JSONObject embeddedInfo() throws Exception {
        try (InputStream in = getAssets().open("payloads/provenance.json"); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ApkPatcher.copy(in, out, 16384);
            return new org.json.JSONObject(out.toString("UTF-8"));
        }
    }
    private void checkPatchUpdates() {
        if (destroyed || checkingPatches) return;
        checkingPatches = true;
        patchStatus.setText("Checking for patch updates…");
        refreshUpdates();
        updateWorker.execute(() -> {
            try {
                org.json.JSONObject info = payloadInfo();
                String embedded = info.getString("version");
                String prepared = getPreferences(0).getString("prepared_patch", embedded);
                boolean includedUpdate = ReleaseVersion.parse(embedded).compareTo(ReleaseVersion.parse(prepared)) > 0;
                String current = includedUpdate ? embedded : prepared;
                UpdatePolicy.PatchRelease release = updater.checkPatch(current, info.getString("runtime"), "wallpaper-storage");
                updateUi(() -> {
                    patchStatus.setText(release != null || includedUpdate ? "Patches " + (release == null ? embedded : release.version.name) + " are available. Prepare and install to update." : "Patches " + current + " are up to date.");
                    if (release != null || includedUpdate) patch.setText("Update installed mods");
                    if (!busy && !source.exists()) status.setText("Get Plural Star above, then prepare and install the update.");
                });
            } catch (Exception e) {
                updateUi(() -> patchStatus.setText("Could not check patches. Updates will be checked again when preparing the app."));
            } finally { updateUi(() -> { checkingPatches = false; refreshUpdates(); }); }
        });
    }
    private void build() { build(false); }
    private void build(boolean included) {
        work("Checking patches…", () -> {
            CompatibilityPack matching = updater.compatibility(source, note -> updateUi(() -> status.setText(note)));
            org.json.JSONObject info = matching == null ? embeddedInfo() : matching.info;
            String version = info.getString("version");
            File downloaded = null;
            if (!included) {
                try {
                    UpdatePolicy.PatchRelease release = updater.checkPatch(version, info.getString("runtime"), "wallpaper-storage");
                    if (release != null) {
                        downloaded = updater.downloadPatch(release, note -> updateUi(() -> status.setText(note)));
                        version = release.version.name;
                    }
                } catch (Exception e) {
                    String prepared = getPreferences(0).getString("prepared_patch", version);
                    boolean safeFallback = ReleaseVersion.parse(version).compareTo(ReleaseVersion.parse(prepared)) >= 0;
                    updateUi(() -> {
                        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("Patch check unavailable")
                            .setMessage("Could not fetch the latest patches. " + (safeFallback ? "Retry when connected, or use the saved matching patches." : "Reconnect and try again to keep your newer patches."))
                            .setNegativeButton("Cancel", null);
                        if (safeFallback) dialog.setPositiveButton("Use saved patches", (d, w) -> build(true));
                        dialog.show();
                    });
                    throw e;
                }
            }
            String previous = getPreferences(0).getString("prepared_patch", version);
            if (ReleaseVersion.parse(version).compareTo(ReleaseVersion.parse(previous)) < 0)
                throw new IOException("Newer patches were prepared before. Reconnect and try again to keep them.");
            final File bundle = downloaded;
            ApkPatcher.patch(source, output, info.getString("supported_apk_sha256"),
                () -> bundle != null ? new FileInputStream(bundle) : matching == null ? getAssets().open("payloads/wallpaper-storage.bundle") : matching.open("wallpaper-storage.bundle"),
                () -> matching == null ? getAssets().open("payloads/wallpaper-storage.dex") : matching.open("wallpaper-storage.dex"),
                SigningIdentity.load(), note -> updateUi(() -> status.setText(note)));
            getPreferences(0).edit().putInt("last_patch_version", BuildConfig.VERSION_CODE).putString("prepared_patch", version).apply();
            final String prepared = version;
            updateUi(() -> { patch.setText("Update installed mods"); patchStatus.setText("Prepared patches " + prepared + " · verified"); });
        }, this::install);
    }
    private void openPluralStar() {
        Intent launch = getPackageManager().getLaunchIntentForPackage("com.pluralspace.app");
        if (launch == null) message("Plural Star is not installed."); else startActivity(launch);
    }
    private void install() {
        try {
            PackageInfo app = getPackageManager().getPackageInfo("com.pluralspace.app", android.os.Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
            byte[] ours = SigningIdentity.load().getCertificates().get(0).getEncoded();
            Signature[] signatures = android.os.Build.VERSION.SDK_INT >= 28 ? app.signingInfo.getApkContentsSigners() : app.signatures;
            boolean matching = signatures != null && Arrays.stream(signatures).anyMatch(s -> Arrays.equals(s.toByteArray(), ours));
            if (!matching) {
                new AlertDialog.Builder(this).setTitle("Back up before replacing Plural Star")
                    .setMessage("Android cannot update this installation with the modded app. Export your data and media from Plural Star and check the backup is saved outside the app. Then uninstall Plural Star in Android Settings and return here to install. Uninstalling deletes the app's private data.")
                    .setNegativeButton("Cancel", null)
                    .setNeutralButton("Open Plural Star", (d, w) -> openPluralStar())
                    .setPositiveButton("Open app settings", (d, w) -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:com.pluralspace.app"))))
                    .show();
                return;
            }
        } catch (PackageManager.NameNotFoundException absent) {
            // Fresh install.
        } catch (Exception e) { message(e.getMessage()); return; }
        if (!output.isFile()) { message("Prepare the app before installing."); return; }
        if (!getPackageManager().canRequestPackageInstalls()) {
            status.setText("Allow installs from this app, then return to continue.");
            startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())), ALLOW_INSTALL);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(ApkProvider.URI, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("Modded Plural Star", ApkProvider.URI));
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) { message("No Android package installer is available. Save the APK and open it from Files."); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == ALLOW_SELF_UPDATE) { if (getPackageManager().canRequestPackageInstalls()) installSelfUpdate(); return; }
        if (request == ALLOW_INSTALL) { if (getPackageManager().canRequestPackageInstalls()) install(); return; }
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK_APK) work("Checking selected APK…", () -> importApk(getContentResolver().openInputStream(uri)));
        if (request == SAVE_APK) work("Saving APK…", () -> {
            try (InputStream in = new FileInputStream(output); OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("Destination is not writable.");
                ApkPatcher.copy(in, out, 160L * 1024 * 1024);
            }
            runOnUiThread(() -> status.setText("Patched APK saved to your chosen location."));
        });
        if (request == SAVE_SOURCE) work("Saving source code…", () -> {
            CompatibilityPack matching = updater.cachedCompatibility(source);
            try (InputStream in = matching == null ? getAssets().open("source/plural-star-mods-source.zip") : matching.open("source.zip"); OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("Destination is not writable.");
                ApkPatcher.copy(in, out, 16L * 1024 * 1024);
            }
            runOnUiThread(() -> status.setText("Complete patcher source saved to your chosen location."));
        });
    }
    @Override protected void onDestroy() { destroyed = true; worker.shutdown(); updateWorker.shutdownNow(); super.onDestroy(); }
}
