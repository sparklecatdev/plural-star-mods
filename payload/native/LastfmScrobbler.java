package dev.sparklecat.music;

import android.content.ComponentName;
import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import com.facebook.react.bridge.Promise;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Device-local opt-in scrobbler. All state is serialized; networking cannot block playback accounting. */
public final class LastfmScrobbler {
    private static LastfmScrobbler instance;
    public static synchronized LastfmScrobbler get(Context context) {
        if (instance == null) instance = new LastfmScrobbler(context.getApplicationContext());
        return instance;
    }
    private final Context context;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final LastfmApi api = new LastfmApi();
    private final AtomicFile file;
    private JSONObject data = new JSONObject();
    private LastfmCore.Tracker tracker = new LastfmCore.Tracker();
    private ScheduledFuture<?> polling;
    private boolean connected, sending, unreadable;
    private volatile long revision;
    private long retryAt, backoff = 30000, lastSave;
    private String preferred = "", error = "", activity = "Enable scrobbling to start.", pendingNow = "", lastNowKey = "";

    private LastfmScrobbler(Context context) {
        this.context = context; file = new AtomicFile(new File(context.getNoBackupFilesDir(), "sparklecat-lastfm-v1"));
        worker.execute(() -> {
            try {
                if (file.getBaseFile().exists() || new File(file.getBaseFile().getPath() + ".bak").exists()) {
                    byte[] bytes = file.readFully();
                    if (bytes.length < 29 || bytes.length > 8388608) throw new java.io.IOException("Invalid Last.fm settings");
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, java.util.Arrays.copyOf(bytes, 12)));
                    data = new JSONObject(new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8));
                    tracker.restore(data.optJSONObject("current"), seconds());
                }
            } catch (Exception e) { unreadable = true; error = "Could not unlock saved Last.fm settings. Disconnect to reset them, then connect again."; }
        });
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias = "sparklecat.lastfm.v1";
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private void save() throws Exception {
        if (unreadable) throw new java.io.IOException("Saved Last.fm settings could not be unlocked. Disconnect to reset them.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8));
        FileOutputStream out = null;
        try { out = file.startWrite(); out.write(cipher.getIV()); out.write(encrypted); file.finishWrite(out); }
        catch (Exception e) { if (out != null) file.failWrite(out); throw e; }
        lastSave = SystemClock.elapsedRealtime();
    }
    private static long seconds() { return System.currentTimeMillis() / 1000; }
    private boolean active() { return !unreadable && data.optBoolean("music") && data.optBoolean("enabled") && !data.optString("session").isEmpty(); }
    private JSONArray queue() { JSONArray queue = data.optJSONArray("queue"); return queue == null ? new JSONArray() : queue; }
    private void run(Promise promise, Action action) {
        worker.execute(() -> {
            try { promise.resolve(action.run()); }
            catch (LastfmApi.Failure e) { error = e.getMessage(); promise.reject("LASTFM", error); }
            catch (Exception e) { error = "Could not save or connect Last.fm. Check your connection and device storage, then retry."; promise.reject("LASTFM", error); }
        });
    }
    private interface Action { Object run() throws Exception; }
    public void status(Promise promise) {
        run(promise, () -> new JSONObject().put("connected", !data.optString("session").isEmpty()).put("username", data.optString("username"))
            .put("enabled", data.optBoolean("enabled")).put("nowPlaying", data.optBoolean("nowPlaying"))
            .put("pendingAuth", !data.optString("token").isEmpty()).put("queued", queue().length())
            .put("listening", active() && connected).put("activity", activity).put("error", error)
            .put("lastScrobble", data.optString("lastScrobble")).toString());
    }
    public void musicEnabled(boolean enabled, Promise promise) {
        run(promise, () -> {
            if (data.optBoolean("music") != enabled) {
                JSONObject old = new JSONObject(data.toString()); data.put("music", enabled);
                if (!enabled) reset();
                try { save(); } catch (Exception e) { data = old; throw e; }
                revision++; schedule();
            }
            return null;
        });
    }
    public void configure(boolean enabled, boolean nowPlaying, Promise promise) {
        run(promise, () -> {
            if (enabled && data.optString("session").isEmpty()) throw new LastfmApi.Failure(9, "Connect a Last.fm account first.");
            JSONObject old = new JSONObject(data.toString());
            data.put("enabled", enabled).put("nowPlaying", nowPlaying);
            if (!enabled) reset();
            try { save(); } catch (Exception e) { data = old; throw e; }
            pendingNow = ""; lastNowKey = "";
            revision++; retryAt = 0; error = ""; schedule(); return null;
        });
    }
    public void begin(String key, String secret, Promise promise) {
        run(promise, () -> {
            if (!key.matches("[a-fA-F0-9]{32}") || !secret.matches("[a-fA-F0-9]{32}"))
                throw new LastfmApi.Failure(6, "Enter the 32-character API key and shared secret from your Last.fm API account.");
            if (!data.optString("session").isEmpty()) throw new LastfmApi.Failure(6, "Disconnect your current account before connecting another.");
            String token = api.call("auth.getToken", Collections.emptyMap(), key, secret, "").getString("token");
            if (!token.matches("[a-zA-Z0-9]{1,128}")) throw new java.io.IOException("Invalid authorization token");
            JSONObject old = new JSONObject(data.toString()); data.put("key", key).put("secret", secret).put("token", token);
            try { save(); } catch (Exception e) { data = old; throw e; }
            error = "";
            return "https://www.last.fm/api/auth/?api_key=" + key + "&token=" + token;
        });
    }
    public void finish(Promise promise) {
        run(promise, () -> {
            if (data.optString("token").isEmpty()) throw new LastfmApi.Failure(6, "Start connecting your account first.");
            JSONObject session = api.call("auth.getSession", Collections.singletonMap("token", data.getString("token")),
                data.getString("key"), data.getString("secret"), "").getJSONObject("session");
            String sessionKey = session.getString("key"), username = session.getString("name");
            if (sessionKey.isEmpty() || sessionKey.length() > 128 || username.isEmpty() || username.length() > 128) throw new java.io.IOException("Invalid Last.fm account");
            JSONObject old = new JSONObject(data.toString());
            data.put("session", sessionKey).put("username", username).put("queue", new JSONArray()).put("enabled", false).put("nowPlaying", false);
            data.remove("token");
            try { save(); } catch (Exception e) { data = old; throw e; }
            revision++; error = ""; return username;
        });
    }
    public void disconnect(Promise promise) {
        run(promise, () -> {
            boolean music = data.optBoolean("music"); revision++; reset();
            data = new JSONObject().put("music", music); unreadable = false; file.delete();
            if (file.getBaseFile().exists()) { unreadable = true; throw new java.io.IOException("Could not remove saved Last.fm account"); }
            error = ""; retryAt = 0; schedule(); return null;
        });
    }
    public void retry(Promise promise) { run(promise, () -> { retryAt = 0; flush(); return null; }); }
    public void source(String id) { worker.execute(() -> preferred = id == null ? "" : id); }
    public void service(boolean available) {
        worker.execute(() -> { connected = available; if (!available) { tracker.pause(); pendingNow = ""; lastNowKey = ""; activity = "Allow music access in Android to scrobble."; } schedule(); });
    }
    private void reset() { tracker = new LastfmCore.Tracker(); data.remove("current"); pendingNow = ""; lastNowKey = ""; activity = "Scrobbling is paused."; }
    private void schedule() {
        if (polling != null) { polling.cancel(false); polling = null; }
        if (active() && connected) polling = worker.scheduleWithFixedDelay(this::tick, 0, 2, TimeUnit.SECONDS);
    }
    private LastfmCore.Track track() {
        MediaSessionManager manager = context.getSystemService(MediaSessionManager.class);
        List<MediaController> sources = manager == null ? Collections.emptyList() : manager.getActiveSessions(new ComponentName(context, MusicNotificationListener.class));
        MediaController selected = null;
        for (MediaController item : sources) if ((item.getPackageName() + ":" + item.getSessionToken().hashCode()).equals(preferred)) { selected = item; break; }
        if (selected == null) for (MediaController item : sources) {
            PlaybackState state = item.getPlaybackState(); if (state != null && state.getState() == PlaybackState.STATE_PLAYING) { selected = item; break; }
        }
        if (selected == null) return null;
        MediaMetadata meta = selected.getMetadata(); PlaybackState state = selected.getPlaybackState();
        if (meta == null || state == null) return null;
        boolean playing = state.getState() == PlaybackState.STATE_PLAYING;
        long position = Math.max(0, state.getPosition());
        if (playing && state.getLastPositionUpdateTime() > 0) position += (long) (Math.max(0, SystemClock.elapsedRealtime() - state.getLastPositionUpdateTime()) * state.getPlaybackSpeed());
        long duration = meta.getLong(MediaMetadata.METADATA_KEY_DURATION);
        return new LastfmCore.Track(selected.getPackageName() + ":" + selected.getSessionToken().hashCode(), meta.getString(MediaMetadata.METADATA_KEY_TITLE),
            meta.getString(MediaMetadata.METADATA_KEY_ARTIST), meta.getString(MediaMetadata.METADATA_KEY_ALBUM), duration, duration > 0 ? Math.min(position, duration) : position, playing);
    }
    private void tick() {
        if (!active() || !connected) return;
        try {
            LastfmCore.Track track = track(); long elapsed = SystemClock.elapsedRealtime();
            JSONObject event = tracker.tick(track, elapsed, seconds());
            activity = track == null ? "Waiting for music." : !track.eligible() ? "Waiting for a song with artist, title and duration over 30 seconds." :
                (track.playing ? "Listening: " : "Paused: ") + track.artist + " — " + track.title;
            if (track == null || !track.playing || !track.eligible()) { pendingNow = ""; lastNowKey = ""; }
            else if (data.optBoolean("nowPlaying") && (tracker.changed || !track.key().equals(lastNowKey))) {
                pendingNow = track.event(seconds()).toString(); lastNowKey = track.key();
            }
            if (event != null) {
                JSONArray queue = queue();
                if (queue.length() >= 500) { queue.remove(0); error = "Offline queue reached 500 listens. The oldest listen was removed."; }
                queue.put(event); data.put("queue", queue);
            }
            data.put("current", tracker.checkpoint(seconds()));
            if (event != null || tracker.changed || elapsed - lastSave > 30000) save();
            flush();
        } catch (SecurityException e) { activity = "Music access was removed. Allow notification access in Android to resume."; tracker = new LastfmCore.Tracker(); }
        catch (Exception e) { error = "Could not read or save music progress. Check music access and device storage."; }
    }
    private void flush() {
        if (!active() || sending || SystemClock.elapsedRealtime() < retryAt) return;
        JSONArray queue = queue(); if (queue.length() == 0 && pendingNow.isEmpty()) return;
        // Never upload a listen that has not first reached durable storage.
        try { if (queue.length() > 0) save(); }
        catch (Exception e) { error = "Could not save queued listens. Free device storage, then retry."; return; }
        List<JSONObject> batch = new ArrayList<>(); for (int i = 0; i < Math.min(50, queue.length()); i++) batch.add(queue.optJSONObject(i));
        String now = pendingNow, key = data.optString("key"), secret = data.optString("secret"), session = data.optString("session");
        pendingNow = ""; long current = revision; sending = true;
        network.execute(() -> {
            Exception failure = null; JSONObject response = null;
            try {
                if (current != revision) return;
                if (!now.isEmpty()) try { api.call("track.updateNowPlaying", LastfmApi.trackParameters(new JSONObject(now)), key, secret, session); }
                catch (LastfmApi.Failure e) { if (e.reconnect()) throw e; /* Ephemeral now-playing updates are never retried. */ }
                catch (Exception ignored) { /* Scrobbles have their own durable queue. */ }
                if (!batch.isEmpty() && current == revision) {
                    Map<String, String> params = new TreeMap<>();
                    for (int i = 0; i < batch.size(); i++) {
                        for (Map.Entry<String, String> entry : LastfmApi.trackParameters(batch.get(i)).entrySet()) params.put(entry.getKey() + "[" + i + "]", entry.getValue());
                        params.put("timestamp[" + i + "]", Long.toString(batch.get(i).optLong("timestamp")));
                    }
                    response = api.call("track.scrobble", params, key, secret, session);
                }
            } catch (Exception e) { failure = e; }
            finally {
                final Exception problem = failure; final JSONObject result = response;
                worker.execute(() -> complete(current, batch, result, problem));
            }
        });
    }
    private void complete(long current, List<JSONObject> batch, JSONObject result, Exception failure) {
        sending = false; if (current != revision) return;
        try {
            if (failure != null) {
                if (failure instanceof LastfmApi.Failure) {
                    LastfmApi.Failure problem = (LastfmApi.Failure) failure; error = problem.getMessage();
                    if (problem.reconnect() || !problem.retryable()) { data.put("enabled", false); save(); schedule(); return; }
                } else error = "Could not reach Last.fm. Queued listens will retry automatically.";
                retryAt = SystemClock.elapsedRealtime() + backoff; backoff = Math.min(1800000, backoff * 2); return;
            }
            if (batch.isEmpty()) return;
            JSONObject old = data; data = LastfmCore.acknowledge(data, batch, result);
            int ignored = data.optInt("ignored"); data.remove("ignored");
            try { save(); } catch (Exception e) { data = old; throw e; }
            error = ignored > 0 ? "Last.fm ignored " + ignored + " listen(s), for example because the metadata or timestamp was invalid." : "";
            backoff = 30000; retryAt = 0; flush();
        } catch (Exception e) {
            error = "Could not confirm or save the Last.fm response. Queued listens will retry.";
            retryAt = SystemClock.elapsedRealtime() + backoff; backoff = Math.min(1800000, backoff * 2);
        }
    }
}
