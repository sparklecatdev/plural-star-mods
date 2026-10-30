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
    private Button patch, install, save;
    private ProgressBar progress;
    private boolean busy;
    private File source, output;
    private UpdateClient updater;
    private UpdatePolicy.Release availableUpdate;
    private TextView updateStatus;
    private Button checkUpdate, downloadUpdate, installUpdate;
    private CheckBox automaticUpdates, previewUpdates;
    private ProgressBar updateProgress;
    private LinearLayout updateCard;
    private ScrollView mainScroll;
    private String downloadedVersion;
    private boolean updateBusy, resumed;
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
        text(first, "Download a compatible copy, choose an APK, or use the app already on your device.", 15, MUTED, false);
        button(first, "Download Plural Star", () -> work("Downloading Plural Star…", () -> importApk(UpdateClient.openOriginalApk())));
        button(first, "Choose APK file", () -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(intent, PICK_APK);
        });
        button(first, "Use installed Plural Star", this::useInstalled);
        selected = text(first, source.exists() ? "Plural Star is ready" : "Choose an option above to get started", 13, ACCENT, false);

        LinearLayout build = card("02", "Install mods");
        text(build, "Includes wallpaper, storage tools, and PluralKit front sync. Manage them in Settings → sparklecat's mods after installing.", 15, MUTED, false);
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
        automaticUpdates = updatePreference(updateCard, "Update patcher automatically", "auto_update", true);
        previewUpdates = updatePreference(updateCard, "Include preview releases", "preview_updates", true);
        checkUpdate = button(updateCard, "Check for updates", () -> checkForUpdates(true));
        downloadUpdate = button(updateCard, "Download and install update", this::downloadSelfUpdate);
        installUpdate = button(updateCard, "Install downloaded update", this::installSelfUpdate);
        updateProgress = new ProgressBar(this); updateProgress.setVisibility(View.GONE); updateCard.addView(updateProgress);
        button(content, "Save patcher source code", () -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip").putExtra(Intent.EXTRA_TITLE, "plural-star-mods-source.zip"), SAVE_SOURCE));
        button(content, "Plural Star project ↗", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/ByHanyou/Plural-Star"))));
        text(content, "Independent mods · AGPL-3.0\nPlural Star by TheHanyou, SPARKLECATDEV, and contributors", 12, MUTED, false);
        refresh();
        if (updater.updateFile().isFile()) updateWork("Checking downloaded update…", () -> {
            try {
                String version = updater.verify(updater.updateFile(), null);
                updateUi(() -> { downloadedVersion = version; updateStatus.setText("Downloaded update v" + version + " is ready to install."); });
            } catch (Exception invalid) {
                updater.updateFile().delete();
                updateUi(() -> updateStatus.setText("Ready to check for updates."));
            }
        });
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
            if (value || key.equals("preview_updates")) checkForUpdates(true);
        });
        return view;
    }
    private void refreshUpdates() {
        if (checkUpdate == null) return;
        checkUpdate.setEnabled(!busy && !updateBusy);
        automaticUpdates.setEnabled(!busy && !updateBusy); previewUpdates.setEnabled(!busy && !updateBusy);
        downloadUpdate.setVisibility(availableUpdate == null ? View.GONE : View.VISIBLE);
        downloadUpdate.setEnabled(!busy && !updateBusy && (availableUpdate != null && !availableUpdate.version.name.equals(downloadedVersion)));
        if (availableUpdate != null) downloadUpdate.setText("Download and install v" + availableUpdate.version.name);
        installUpdate.setVisibility(downloadedVersion == null ? View.GONE : View.VISIBLE);
        installUpdate.setEnabled(!busy && !updateBusy);
        updateProgress.setVisibility(updateBusy ? View.VISIBLE : View.GONE);
    }
    private void updateUi(Runnable action) { runOnUiThread(() -> { if (!destroyed) action.run(); }); }
    private void updateWork(String label, CheckedAction action) {
        if (destroyed || updateBusy) return;
        updateBusy = true; updateStatus.setText(label); refresh();
        updateWorker.execute(() -> {
            try { action.run(); }
            catch (Exception e) { updateUi(() -> updateStatus.setText("Update unavailable: " + e.getMessage())); }
            finally { updateUi(() -> { updateBusy = false; refresh(); maybeCheckAutomatically(); }); }
        });
    }
    private void maybeCheckAutomatically() {
        if (automaticUpdates == null || !automaticUpdates.isChecked() || updateBusy || destroyed) return;
        long last = getPreferences(0).getLong("last_update_check", 0), now = System.currentTimeMillis();
        if (last == 0 || now < last || now - last >= 24L * 60 * 60 * 1000) checkForUpdates(false);
    }
    private void checkForUpdates(boolean manual) {
        if (updateBusy || destroyed) return;
        if (!manual && !automaticUpdates.isChecked()) return;
        boolean previews = previewUpdates.isChecked();
        boolean automatically = automaticUpdates.isChecked();
        String downloaded = downloadedVersion;
        availableUpdate = null;
        getPreferences(0).edit().putLong("last_update_check", System.currentTimeMillis()).apply();
        updateWork("Checking for updates…", () -> {
            UpdatePolicy.Release release = updater.check(previews);
            updateUi(() -> {
                availableUpdate = release;
                updateStatus.setText(release == null ? (downloadedVersion == null ? "You're up to date." : "Downloaded update is ready to install.") : "Version " + release.version.name + " is available.");
            });
            if (automatically && release != null && !release.version.name.equals(downloaded)) prepareSelfUpdate(release);
        });
    }
    private void downloadSelfUpdate() {
        UpdatePolicy.Release release = availableUpdate;
        if (release == null) return;
        updateWork("Preparing update…", () -> prepareSelfUpdate(release));
    }
    private void prepareSelfUpdate(UpdatePolicy.Release release) throws Exception {
        updater.download(release, note -> updateUi(() -> updateStatus.setText(note)));
        updateUi(() -> { downloadedVersion = release.version.name; updateStatus.setText("Update verified and ready to install."); openSelfInstaller(); });
    }
    private void installSelfUpdate() {
        updateWork("Verifying downloaded update…", () -> {
            String version = updater.verify(updater.updateFile(), null);
            updateUi(() -> { downloadedVersion = version; openSelfInstaller(); });
        });
    }
    private void openSelfInstaller() {
        if (!resumed) { updateStatus.setText("Update downloaded. Tap Install downloaded update when ready."); return; }
        if (busy) { updateStatus.setText("Update downloaded. Finish patching, then tap Install downloaded update."); return; }
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
        if (data != null && "sparklecatmods".equals(data.getScheme()) && "updates".equals(data.getHost())) {
            mainScroll.post(() -> mainScroll.smoothScrollTo(0, updateCard.getTop()));
            checkForUpdates(true);
        }
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleUpdateLink(intent); }
    @Override protected void onResume() { super.onResume(); resumed = true; maybeCheckAutomatically(); }
    @Override protected void onPause() { resumed = false; super.onPause(); }
    private void work(String label, CheckedAction action) {
        work(label, action, () -> {});
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
                updateUi(() -> { busy = false; refresh(); if (ready && resumed) completed.run(); });
            }
        });
    }
    interface CheckedAction { void run() throws Exception; }
    private void importApk(InputStream input) throws Exception {
        if (input == null) throw new IOException("Could not open the selected file.");
        File temporary = new File(getCacheDir(), "import.apk");
        try {
            try (InputStream in = input; OutputStream out = new FileOutputStream(temporary)) { ApkPatcher.copy(in, out, 160L * 1024 * 1024); }
            if (!ApkPatcher.SOURCE_SHA256.equals(ApkPatcher.sha256(temporary))) throw new IOException("This copy is not compatible. Use Download Plural Star to get the supported official release.");
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
    private void build() {
        work("Preparing mods…", () -> {
            ApkPatcher.patch(source, output, () -> getAssets().open("payloads/wallpaper-storage.bundle"), () -> getAssets().open("payloads/wallpaper-storage.dex"), SigningIdentity.load(),
                note -> runOnUiThread(() -> status.setText(note)));
            getPreferences(0).edit().putInt("last_patch_version", BuildConfig.VERSION_CODE).apply();
            updateUi(() -> patch.setText("Prepare and install"));
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
            try (InputStream in = getAssets().open("source/plural-star-mods-source.zip"); OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("Destination is not writable.");
                ApkPatcher.copy(in, out, 16L * 1024 * 1024);
            }
            runOnUiThread(() -> status.setText("Complete patcher source saved to your chosen location."));
        });
    }
    @Override protected void onDestroy() { destroyed = true; worker.shutdown(); updateWorker.shutdownNow(); super.onDestroy(); }
}
