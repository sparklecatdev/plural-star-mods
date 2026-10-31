package dev.sparklecat.unlock;

import android.content.Context;
import com.facebook.react.bridge.*;

public final class RestModeModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext context;
    public RestModeModule(ReactApplicationContext context) { super(context); this.context = context; }
    @Override public String getName() { return "RestMode"; }
    @ReactMethod public void configure(boolean notifications, boolean enabled, int start, int end, Promise promise) {
        boolean saved = context.getSharedPreferences("plural_star_rest", Context.MODE_PRIVATE).edit()
            .putBoolean("notifications", notifications).putBoolean("enabled", enabled)
            .putInt("start", start >= 0 && start < 1440 ? start : -1)
            .putInt("end", end >= 0 && end < 1440 ? end : -1).commit();
        if (saved) promise.resolve(null); else promise.reject("REST_MODE_SAVE", "Could not save notification schedule");
    }
}
