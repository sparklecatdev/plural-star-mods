package dev.sparklecat.pluralmods;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.res.Resources;
import android.content.res.XmlResourceParser;
import android.util.TypedValue;
import org.xmlpull.v1.XmlPullParser;
import java.io.*;
import java.util.*;

/** Creates launcher icon XML without changing the original foreground or background. */
final class ThemedIcon {
    static Map<String, byte[]> create(Context context, File apk) throws Exception {
        PackageInfo info = context.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null || info.applicationInfo == null || !"com.pluralspace.app".equals(info.packageName))
            throw new IOException("Could not read Plural Star's launcher icon.");
        ApplicationInfo app = info.applicationInfo;
        app.sourceDir = apk.getAbsolutePath(); app.publicSourceDir = app.sourceDir;
        Resources resources = context.getPackageManager().getResourcesForApplication(app);
        byte[] template;
        try (InputStream in = context.getResources().openRawResource(R.raw.themed_icon_template); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ApkPatcher.copy(in, out, 65536); template = out.toByteArray();
        }
        Map<String, byte[]> result = new HashMap<>();
        for (String name : new String[] {"ic_launcher", "ic_launcher_round"}) {
            int id = resources.getIdentifier(name, "mipmap", info.packageName);
            if (id == 0) throw new IOException("This Plural Star version has an unsupported launcher icon.");
            TypedValue value = new TypedValue(); resources.getValue(id, value, true);
            if (value.string == null || !value.string.toString().endsWith(".xml"))
                throw new IOException("This Plural Star version has an unsupported launcher icon.");
            int background = 0, foreground = 0;
            try (XmlResourceParser xml = resources.getXml(id)) {
                while (xml.next() != XmlPullParser.END_DOCUMENT) {
                    if (xml.getEventType() != XmlPullParser.START_TAG) continue;
                    if ("background".equals(xml.getName())) background = xml.getAttributeResourceValue("http://schemas.android.com/apk/res/android", "drawable", 0);
                    if ("foreground".equals(xml.getName())) foreground = xml.getAttributeResourceValue("http://schemas.android.com/apk/res/android", "drawable", 0);
                }
            }
            if (background == 0 || foreground == 0) throw new IOException("This Plural Star version has an unsupported launcher icon.");
            byte[] icon = template.clone();
            replace(icon, 0x7f010000, background); replace(icon, 0x7f020000, foreground);
            result.put(value.string.toString(), icon);
        }
        return result;
    }
    private static void replace(byte[] bytes, int from, int to) throws IOException {
        int count = 0;
        for (int i = 0; i <= bytes.length - 4; i++) {
            if ((bytes[i] & 255) == (from & 255) && (bytes[i + 1] & 255) == ((from >>> 8) & 255)
                    && (bytes[i + 2] & 255) == ((from >>> 16) & 255) && (bytes[i + 3] & 255) == (from >>> 24)) {
                for (int j = 0; j < 4; j++) bytes[i + j] = (byte) (to >>> (8 * j));
                count++; i += 3;
            }
        }
        if (count != 1) throw new IOException("The themed icon template is invalid.");
    }
}
