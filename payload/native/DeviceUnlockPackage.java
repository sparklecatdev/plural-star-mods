package dev.sparklecat.unlock;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class DeviceUnlockPackage implements ReactPackage {
    public static List<ReactPackage> appendPackages(List<ReactPackage> existing) {
        List<ReactPackage> packages = new ArrayList<>(existing);
        packages.add(new DeviceUnlockPackage());
        return packages;
    }

    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
        return Collections.singletonList(new DeviceUnlockModule(context));
    }

    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {
        return Collections.emptyList();
    }
}
