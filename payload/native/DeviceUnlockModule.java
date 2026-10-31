package dev.sparklecat.unlock;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public final class DeviceUnlockModule extends ReactContextBaseJavaModule {
    private static final int REQUEST_CODE = 0x5A31;
    private final ReactApplicationContext context;
    private Promise pending;
    private final BaseActivityEventListener listener = new BaseActivityEventListener() {
        @Override public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode != REQUEST_CODE || pending == null) return;
            Promise result = pending;
            pending = null;
            result.resolve(resultCode == Activity.RESULT_OK);
        }
    };

    public DeviceUnlockModule(ReactApplicationContext context) {
        super(context);
        this.context = context;
        context.addActivityEventListener(listener);
    }

    @Override public String getName() { return "SparklecatDeviceUnlock"; }

    @ReactMethod public void available(Promise promise) {
        KeyguardManager manager = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        promise.resolve(manager != null && manager.isDeviceSecure());
    }

    @ReactMethod public void authenticate(Promise promise) {
        if (pending != null) { promise.reject("busy", "Device unlock is already open."); return; }
        Activity activity = getCurrentActivity();
        KeyguardManager manager = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        if (activity == null || manager == null || !manager.isDeviceSecure()) {
            promise.reject("unavailable", "Device unlock is unavailable.");
            return;
        }
        Intent intent = manager.createConfirmDeviceCredentialIntent("Unlock Plural Star", "Confirm your device screen lock");
        if (intent == null) { promise.reject("unavailable", "Device unlock is unavailable."); return; }
        pending = promise;
        activity.runOnUiThread(() -> {
            try { activity.startActivityForResult(intent, REQUEST_CODE); }
            catch (RuntimeException error) {
                Promise result = pending;
                pending = null;
                if (result != null) result.reject("unavailable", error);
            }
        });
    }

    @Override public void invalidate() {
        context.removeActivityEventListener(listener);
        if (pending != null) { pending.reject("cancelled", "Device unlock closed."); pending = null; }
        super.invalidate();
    }
}
