package android.content;

import java.io.File;

/** Only the Android API used by the loader, for JVM file-system tests. */
public abstract class Context {
    public abstract File getFilesDir();
}
