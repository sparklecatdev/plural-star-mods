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
    private static final int PICK_APK = 10, SAVE_APK = 11;
    private static final int BG = Color.rgb(20,16,31), CARD = Color.rgb(36,27,51), INK = Color.rgb(255,246,255), MUTED = Color.rgb(197,185,212), ACCENT = Color.rgb(229,181,255);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final java.util.List<View> controls = new java.util.ArrayList<>();
    private LinearLayout content;
    private TextView status, selected;
    private CheckBox wallpaper, storage;
    private Button patch, install, save;
    private ProgressBar progress;
    private boolean busy;
    private File source, output;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        source = new File(getFilesDir(), "original.apk"); output = new File(getFilesDir(), "patched.apk");
        ScrollView scroll = new ScrollView(this); scroll.setBackgroundColor(BG); scroll.setFillViewport(true);
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
        text(content, "A little more you. A little more sparkle.", 16, MUTED, false);
        text(content, "OFFLINE PATCHER  ·  PLURAL STAR 1.23.3", 11, ACCENT, true);

        LinearLayout first = card("01", "Choose Plural Star");
        text(first, "Select the original 1.23.3 app-release.apk. Its SHA-256 must match the official release; other versions and split APKs are rejected.", 15, MUTED, false);
        button(first, "Choose APK file", () -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(intent, PICK_APK);
        });
        button(first, "Use installed Plural Star", this::useInstalled);
        button(first, "Get supported release ↗", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/ByHanyou/Plural-Star/releases/tag/v1.23.3"))));
        selected = text(first, source.exists() ? "Original APK selected" : "No APK selected", 13, ACCENT, false);

        LinearLayout mods = card("02", "Make it yours");
        wallpaper = check(mods, "Wallpaper backgrounds", "Choose, replace, or remove a palette-tinted image in Settings. Adapted from upstream PR #24.", "wallpaper");
        storage = check(mods, "Storage saver & restorer", "Password-encrypted snapshots of records, managed media, wallpaper, and identity. Restore before app sync starts.", "storage");
        text(mods, "Storage tools appear when the patched app launches. Fully close and reopen it to return to the tools. Snapshots have a 32 MiB encoded-data limit.", 14, MUTED, false);

        LinearLayout build = card("03", "Create your patched APK");
        patch = button(build, "✦  Patch APK", this::build);
        progress = new ProgressBar(this); progress.setVisibility(View.GONE); build.addView(progress);
        status = text(build, output.exists() ? "Your previous patched APK is ready." : "Ready when you are. All patching happens on your device.", 14, MUTED, false);
        save = button(build, "Save patched APK", () -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/vnd.android.package-archive")
            .putExtra(Intent.EXTRA_TITLE, "plural-star-sparklecat-mods.apk"), SAVE_APK));
        install = button(build, "Install patched APK", this::install);

        LinearLayout data = card("♡", "Keep your stars safe");
        text(data, "Before your first install, export your data and media from the official app and verify the backup is saved outside the app. Android requires uninstalling the official app because this APK uses a different signing key. Uninstalling deletes its private data.", 15, MUTED, false);
        text(data, "After installing, import your standard JSON/ZIP backup inside Plural Star. For future moves, enable the storage mod and save an encrypted .scat snapshot. Android prevents this patcher from reading another app's private storage.", 15, MUTED, false);
        text(data, "Keep this patcher installed: its signing key stays in Android Keystore so future patches can update your modded app. Clearing patcher data or reinstalling it loses that key. System settings, permissions, and external files are outside snapshots.", 14, MUTED, false);
        button(data, "Open Plural Star", this::openPluralStar);
        button(content, "Source & wallpaper credits ↗", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/sparklecatdev/plural-star-mods"))));
        text(content, "Independent mods · AGPL-3.0\nPlural Star by ByHanyou and contributors\nWallpaper feature from PR #24 by sparklecatdev", 12, MUTED, false);
        refresh();
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
        text(l, number + "  /  " + title, 21, INK, true); return l;
    }
    private Button button(LinearLayout parent, String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextColor(INK); b.setTextSize(15); b.setMinHeight(dp(52));
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(92,65,125)));
        b.setOnClickListener(v -> { try { action.run(); } catch (Exception e) { message(e.getMessage()); } });
        parent.addView(b, new LinearLayout.LayoutParams(-1,-2)); controls.add(b); return b;
    }
    private CheckBox check(LinearLayout parent, String title, String detail, String key) {
        CheckBox b = new CheckBox(this); b.setText(title); b.setTextSize(18); b.setTextColor(INK); b.setMinHeight(dp(48));
        b.setChecked(getPreferences(0).getBoolean(key, true)); parent.addView(b); controls.add(b); text(parent, detail, 14, MUTED, false);
        b.setOnCheckedChangeListener((v, checked) -> { getPreferences(0).edit().putBoolean(key, checked).apply(); output.delete(); refresh(); }); return b;
    }
    private void message(String s) { new AlertDialog.Builder(this).setTitle("sparklecat's mods").setMessage(s == null ? "Operation failed." : s).setPositiveButton("OK", null).show(); }
    private void refresh() {
        for (View c : controls) c.setEnabled(!busy);
        patch.setEnabled(!busy && source.exists() && (wallpaper.isChecked() || storage.isChecked()));
        save.setEnabled(!busy && output.exists()); install.setEnabled(!busy && output.exists());
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }
    private void work(String label, CheckedAction action) {
        busy = true; status.setText(label); refresh();
        worker.execute(() -> {
            try { action.run(); }
            catch (Exception e) { runOnUiThread(() -> status.setText("Could not finish: " + e.getMessage())); }
            finally { runOnUiThread(() -> { busy = false; refresh(); }); }
        });
    }
    interface CheckedAction { void run() throws Exception; }
    private void importApk(InputStream input) throws Exception {
        File temporary = new File(getCacheDir(), "import.apk");
        try {
            try (InputStream in = input; OutputStream out = new FileOutputStream(temporary)) { ApkPatcher.copy(in, out, 160L * 1024 * 1024); }
            if (!ApkPatcher.SOURCE_SHA256.equals(ApkPatcher.sha256(temporary))) throw new IOException("Unsupported APK. Select the original official 1.23.3 release.");
            if (source.exists() && !source.delete()) throw new IOException("Could not replace input.");
            if (!temporary.renameTo(source)) throw new IOException("Could not save selected APK.");
            output.delete();
            runOnUiThread(() -> { selected.setText("✓ Plural Star 1.23.3 · SHA-256 verified"); status.setText("Choose your mods and patch."); });
        } finally { temporary.delete(); }
    }
    private void useInstalled() {
        work("Reading installed APK…", () -> {
            ApplicationInfo app = getPackageManager().getApplicationInfo("com.pluralspace.app", 0);
            if (app.splitSourceDirs != null && app.splitSourceDirs.length > 0) throw new IOException("Split installations are unsupported. Choose the official standalone APK instead.");
            importApk(new FileInputStream(app.sourceDir));
        });
    }
    private void build() {
        String variant = wallpaper.isChecked() ? (storage.isChecked() ? "wallpaper-storage" : "wallpaper") : "storage";
        work("Preparing patch…", () -> ApkPatcher.patch(source, output, () -> getAssets().open("payloads/" + variant + ".bundle"), SigningIdentity.load(),
            note -> runOnUiThread(() -> status.setText(note))));
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
                message("The installed Plural Star uses a different signing key. Export and verify its data/media backup first, then uninstall it yourself in Android Settings. Return here to install the patched APK and import the backup. This patcher never uninstalls apps or accesses their private data."); return;
            }
        } catch (PackageManager.NameNotFoundException absent) {
            // Fresh install.
        } catch (Exception e) { message(e.getMessage()); return; }
        new AlertDialog.Builder(this).setTitle("Ready to install?")
            .setMessage("Make sure you have a verified backup saved outside Plural Star. Keep this patcher installed so its signing key remains available for future updates.")
            .setNegativeButton("Cancel", null).setPositiveButton("Continue", (d, w) -> {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                    message("Allow installs from this patcher, then tap Install patched APK again."); return;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(ApkProvider.URI, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.setClipData(ClipData.newRawUri("Patched APK", ApkProvider.URI));
                try { startActivity(intent); } catch (ActivityNotFoundException e) { message("No Android package installer is available. Save the APK and open it from Files."); }
            }).show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
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
    }
    @Override protected void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
