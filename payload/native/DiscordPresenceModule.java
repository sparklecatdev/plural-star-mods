package dev.sparklecat.unlock;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.nio.charset.StandardCharsets;

public final class DiscordPresenceModule extends ReactContextBaseJavaModule {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean initialized;
    private String current;
    private String pending;
    private final Runnable retry = () -> setPresence(pending);
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!initialized) return;
            pump();
            handler.postDelayed(this, 100);
        }
    };
    public DiscordPresenceModule(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "SparklecatDiscordPresence"; }
    @ReactMethod public void setPresence(String text) {
        handler.post(() -> {
            try {
                handler.removeCallbacks(retry);
                pending = text;
                if (text == null || text.isEmpty()) {
                    current = null;
                    if (initialized) clear();
                    return;
                }
                if (!initialized) {
                    Activity activity = getCurrentActivity();
                    if (activity == null) { handler.postDelayed(retry, 1000); return; }
                    Class.forName("com.discord.socialsdk.DiscordSocialSdkInit")
                        .getMethod("setEngineActivity", Activity.class).invoke(null, activity);
                    System.loadLibrary("discord_partner_sdk");
                    System.loadLibrary("sparklecat_discord");
                    initializeClient();
                    initialized = true;
                    handler.post(tick);
                }
                if (!text.equals(current)) {
                    current = text;
                    update(text.getBytes(StandardCharsets.UTF_8));
                }
            } catch (LinkageError | ReflectiveOperationException | RuntimeException e) {
                android.util.Log.w("SparklecatDiscord", "Discord presence unavailable", e);
            }
        });
    }
    @Override public void invalidate() {
        handler.post(() -> {
            if (initialized) { clear(); pump(); shutdown(); initialized = false; }
            pending = null;
            handler.removeCallbacks(retry);
            handler.removeCallbacks(tick);
        });
        super.invalidate();
    }
    private static native void initializeClient();
    private static native void update(byte[] text);
    private static native void clear();
    private static native void pump();
    private static native void shutdown();
}
