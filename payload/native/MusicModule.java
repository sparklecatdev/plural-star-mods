package dev.sparklecat.music;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.VolumeProvider;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;

/** Foreground-only media controls; no player, account, or notification data is uploaded. */
public final class MusicModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext context;
    private String artworkKey = "", artworkUri = "";

    public MusicModule(ReactApplicationContext context) { super(context); this.context = context; }
    @Override public String getName() { return "SparklecatMusic"; }
    private ComponentName listener() { return new ComponentName(context, MusicNotificationListener.class); }
    private boolean hasAccess() {
        if (Build.VERSION.SDK_INT >= 27) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            return manager != null && manager.isNotificationListenerAccessGranted(listener());
        }
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (enabled != null) for (String item : enabled.split(":")) if (listener().equals(ComponentName.unflattenFromString(item))) return true;
        return false;
    }
    private List<MediaController> sessions() {
        MediaSessionManager manager = context.getSystemService(MediaSessionManager.class);
        return manager == null ? Collections.emptyList() : manager.getActiveSessions(listener());
    }
    private static String id(MediaController controller) { return controller.getPackageName() + ":" + controller.getSessionToken().hashCode(); }
    private static String text(CharSequence value) { return value == null ? "" : value.subSequence(0, Math.min(value.length(), 1000)).toString(); }
    private String label(MediaController controller) {
        try { return text(context.getPackageManager().getApplicationLabel(context.getPackageManager().getApplicationInfo(controller.getPackageName(), 0))); }
        catch (android.content.pm.PackageManager.NameNotFoundException e) { return controller.getPackageName(); }
    }
    private static boolean playing(PlaybackState state) { return state != null && state.getState() == PlaybackState.STATE_PLAYING; }

    @ReactMethod public void getSnapshot(String preferredId, Promise promise) {
        try {
            WritableMap result = Arguments.createMap();
            boolean access = hasAccess(); result.putBoolean("access", access);
            WritableArray sources = Arguments.createArray();
            if (!access) { result.putArray("sessions", sources); promise.resolve(result); return; }
            List<MediaController> available = sessions(); MediaController selected = null;
            for (MediaController controller : available) {
                WritableMap source = Arguments.createMap();
                source.putString("id", id(controller)); source.putString("name", label(controller));
                source.putBoolean("playing", playing(controller.getPlaybackState())); sources.pushMap(source);
                if (id(controller).equals(preferredId)) selected = controller;
            }
            if (selected == null) for (MediaController controller : available) if (playing(controller.getPlaybackState())) { selected = controller; break; }
            if (selected == null && !available.isEmpty()) selected = available.get(0);
            result.putArray("sessions", sources);
            if (selected != null) result.putMap("track", snapshot(selected));
            promise.resolve(result);
        } catch (SecurityException e) {
            WritableMap result = Arguments.createMap(); result.putBoolean("access", false); result.putArray("sessions", Arguments.createArray()); promise.resolve(result);
        } catch (Exception e) { promise.reject("MUSIC_READ", "Could not read the music player. Try opening your music app again.", e); }
    }

    private WritableMap snapshot(MediaController controller) throws Exception {
        WritableMap track = Arguments.createMap();
        MediaMetadata metadata = controller.getMetadata(); PlaybackState state = controller.getPlaybackState();
        MediaDescription description = metadata == null ? null : metadata.getDescription();
        String title = metadata == null ? "" : text(metadata.getText(MediaMetadata.METADATA_KEY_TITLE));
        String artist = metadata == null ? "" : text(metadata.getText(MediaMetadata.METADATA_KEY_ARTIST));
        if (title.isEmpty() && description != null) title = text(description.getTitle());
        if (artist.isEmpty() && description != null) artist = text(description.getSubtitle());
        String album = metadata == null ? "" : text(metadata.getText(MediaMetadata.METADATA_KEY_ALBUM));
        long duration = metadata == null ? 0 : Math.max(0, metadata.getLong(MediaMetadata.METADATA_KEY_DURATION));
        long position = state == null ? 0 : Math.max(0, state.getPosition());
        if (playing(state) && state.getLastPositionUpdateTime() > 0) position += (long) (Math.max(0, SystemClock.elapsedRealtime() - state.getLastPositionUpdateTime()) * state.getPlaybackSpeed());
        track.putString("sessionId", id(controller)); track.putString("source", label(controller));
        track.putString("title", title); track.putString("artist", artist); track.putString("album", album);
        track.putDouble("duration", duration); track.putDouble("position", Math.max(0, duration > 0 ? Math.min(duration, position) : position));
        track.putBoolean("playing", playing(state));
        track.putBoolean("buffering", state != null && (state.getState() == PlaybackState.STATE_BUFFERING || state.getState() == PlaybackState.STATE_CONNECTING));
        long actions = state == null ? 0 : state.getActions();
        track.putBoolean("canPlay", (actions & (PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
        track.putBoolean("canPause", (actions & (PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
        track.putBoolean("canNext", (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
        track.putBoolean("canPrevious", (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
        track.putBoolean("canSeek", (actions & PlaybackState.ACTION_SEEK_TO) != 0 && duration > 0);
        track.putBoolean("canQueue", (actions & PlaybackState.ACTION_SKIP_TO_QUEUE_ITEM) != 0);
        try { track.putString("artwork", artwork(metadata, controller.getPackageName() + "|" + title + "|" + artist + "|" + album)); }
        catch (Exception ignored) { track.putString("artwork", ""); }
        MediaController.PlaybackInfo info = controller.getPlaybackInfo();
        track.putInt("volume", info == null ? 0 : info.getCurrentVolume()); track.putInt("maxVolume", info == null ? 0 : info.getMaxVolume());
        track.putBoolean("canVolume", info != null && info.getVolumeControl() == VolumeProvider.VOLUME_CONTROL_ABSOLUTE);
        WritableArray queue = Arguments.createArray();
        List<MediaSession.QueueItem> items = controller.getQueue();
        if (items != null) for (MediaSession.QueueItem item : items.subList(0, Math.min(items.size(), 200))) {
            WritableMap row = Arguments.createMap();
            row.putString("id", Long.toString(item.getQueueId())); row.putString("title", text(item.getDescription().getTitle()));
            row.putString("artist", text(item.getDescription().getSubtitle()));
            row.putBoolean("active", state != null && state.getActiveQueueItemId() == item.getQueueId()); queue.pushMap(row);
        }
        track.putArray("queue", queue);
        WritableArray custom = Arguments.createArray();
        if (state != null) for (PlaybackState.CustomAction action : state.getCustomActions().subList(0, Math.min(state.getCustomActions().size(), 12))) {
            WritableMap row = Arguments.createMap(); row.putString("id", action.getAction()); row.putString("name", text(action.getName())); custom.pushMap(row);
        }
        track.putArray("customActions", custom);
        return track;
    }

    private String artwork(MediaMetadata metadata, String key) throws Exception {
        if (metadata == null) return "";
        Bitmap bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (bitmap == null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (bitmap == null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        key += bitmap == null ? "|none" : "|bitmap";
        if (key.equals(artworkKey) && (artworkUri.isEmpty() || new File(android.net.Uri.parse(artworkUri).getPath()).isFile())) return artworkUri;
        if (bitmap == null) { artworkKey = key; artworkUri = ""; return ""; }
        File directory = new File(context.getCacheDir(), "sparklecat-music");
        if (!directory.isDirectory() && !directory.mkdirs()) return "";
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder(); for (byte value : digest) name.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        File file = new File(directory, name + ".jpg");
        if (!file.isFile()) {
            float scale = Math.min(1f, 600f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            Bitmap small = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * scale)), Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
            try (FileOutputStream out = new FileOutputStream(file)) { if (!small.compress(Bitmap.CompressFormat.JPEG, 88, out)) throw new java.io.IOException("Artwork encoding failed"); }
            finally { if (small != bitmap) small.recycle(); }
            File[] files = directory.listFiles();
            if (files != null && files.length > 24) for (File old : files) if (!old.equals(file)) old.delete();
        }
        artworkKey = key; artworkUri = android.net.Uri.fromFile(file).toString(); return artworkUri;
    }

    @ReactMethod public void openAccessSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent); promise.resolve(null);
        } catch (Exception e) { promise.reject("MUSIC_SETTINGS", "Open Android Settings → Notification access and allow Plural Star.", e); }
    }

    @ReactMethod public void command(String sessionId, String action, String argument, Promise promise) {
        try {
            if (!hasAccess()) throw new IllegalStateException("Music access is turned off in Android Settings.");
            MediaController controller = null;
            for (MediaController candidate : sessions()) if (id(candidate).equals(sessionId)) { controller = candidate; break; }
            if (controller == null) throw new IllegalStateException("This player has closed. Start music again.");
            MediaController.TransportControls controls = controller.getTransportControls();
            PlaybackState state = controller.getPlaybackState(); long actions = state == null ? 0 : state.getActions();
            switch (action) {
                case "play": require(actions, PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE); controls.play(); break;
                case "pause": require(actions, PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE); controls.pause(); break;
                case "next": require(actions, PlaybackState.ACTION_SKIP_TO_NEXT); controls.skipToNext(); break;
                case "previous": require(actions, PlaybackState.ACTION_SKIP_TO_PREVIOUS); controls.skipToPrevious(); break;
                case "seek": {
                    require(actions, PlaybackState.ACTION_SEEK_TO);
                    long duration = controller.getMetadata() == null ? 0 : controller.getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION);
                    long position = Long.parseLong(argument);
                    if (duration <= 0 || position < 0 || position > duration) throw new IllegalArgumentException("Invalid playback position.");
                    controls.seekTo(position); break;
                }
                case "queue": {
                    require(actions, PlaybackState.ACTION_SKIP_TO_QUEUE_ITEM); long queueId = Long.parseLong(argument); boolean found = false;
                    List<MediaSession.QueueItem> items = controller.getQueue();
                    if (items != null) for (MediaSession.QueueItem item : items) if (item.getQueueId() == queueId) found = true;
                    if (!found) throw new IllegalArgumentException("This queue item is no longer available.");
                    controls.skipToQueueItem(queueId); break;
                }
                case "custom": {
                    PlaybackState.CustomAction selected = null;
                    if (state != null) for (PlaybackState.CustomAction item : state.getCustomActions()) if (item.getAction().equals(argument)) selected = item;
                    if (selected == null) throw new IllegalArgumentException("This player action is no longer available.");
                    controls.sendCustomAction(selected, null); break;
                }
                case "volume": {
                    MediaController.PlaybackInfo info = controller.getPlaybackInfo(); int value = Integer.parseInt(argument);
                    if (info == null || info.getVolumeControl() != VolumeProvider.VOLUME_CONTROL_ABSOLUTE || value < 0 || value > info.getMaxVolume()) throw new IllegalArgumentException("Volume cannot be changed for this player.");
                    controller.setVolumeTo(value, 0); break;
                }
                case "open":
                    if (controller.getSessionActivity() == null) throw new IllegalStateException("Open your music app from the home screen.");
                    controller.getSessionActivity().send(); break;
                default: throw new IllegalArgumentException("Unknown music action.");
            }
            promise.resolve(null);
        } catch (Exception e) { promise.reject("MUSIC_CONTROL", e.getMessage() == null ? "The music app did not accept this action." : e.getMessage(), e); }
    }
    private static void require(long actions, long required) {
        if ((actions & required) == 0) throw new IllegalStateException("This music app does not support that control.");
    }
}
