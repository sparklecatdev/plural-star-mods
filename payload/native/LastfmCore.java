package dev.sparklecat.music;

import org.json.JSONObject;
import org.json.JSONArray;
import java.util.List;

/** Playback accounting without Android or network dependencies. Times are milliseconds unless named otherwise. */
public final class LastfmCore {
    private LastfmCore() {}

    public static final class Track {
        public final String source, title, artist, album;
        public final long duration, position;
        public final boolean playing;
        public Track(String source, String title, String artist, String album, long duration, long position, boolean playing) {
            this.source = clean(source); this.title = clean(title); this.artist = clean(artist); this.album = clean(album);
            this.duration = Math.max(0, Math.min(86400000, duration)); this.position = Math.max(0, position); this.playing = playing;
        }
        public String key() { return source + "\n" + artist + "\n" + title + "\n" + album; }
        public boolean eligible() { return !title.isEmpty() && !artist.isEmpty() && duration > 30000; }
        public long threshold() { return Math.min(duration / 2, 240000); }
        public JSONObject event(long timestamp) throws Exception {
            return new JSONObject().put("artist", artist).put("track", title).put("album", album)
                .put("duration", duration / 1000).put("timestamp", timestamp);
        }
    }
    private static String clean(String value) { return value == null ? "" : value.substring(0, Math.min(1000, value.length())).trim(); }

    public static final class Tracker {
        private String key = "";
        private long timestamp, elapsed, position, listened;
        private boolean playing, submitted;
        public boolean changed;

        public JSONObject tick(Track track, long nowElapsed, long nowSeconds) throws Exception {
            changed = false;
            if (track == null) { playing = false; return null; }
            // A genuine wrap at the end starts a fresh listen; seeking elsewhere never earns listening time.
            boolean replay = track.key().equals(key) && track.duration > 30000 && position >= track.duration - 10000
                && track.position < 10000 && position - track.position > track.duration / 2;
            if (!track.key().equals(key) || replay) {
                key = track.key(); timestamp = nowSeconds; listened = 0; submitted = false; playing = false; changed = true;
            }
            long delta = nowElapsed - elapsed, advance = track.position - position;
            if (playing && track.playing && !changed && delta > 0 && delta <= 15000 && advance >= 0 && advance <= delta + 2000) {
                // Position must advance too: a stuck session, pause, seek or device sleep must not count as a listen.
                listened += Math.min(delta, advance);
            }
            elapsed = nowElapsed; position = track.position; playing = track.playing;
            if (!submitted && track.eligible() && listened >= track.threshold()) {
                submitted = true; return track.event(timestamp);
            }
            return null;
        }
        public JSONObject checkpoint(long nowSeconds) throws Exception {
            return new JSONObject().put("key", key).put("timestamp", timestamp).put("position", position)
                .put("listened", listened).put("submitted", submitted).put("savedAt", nowSeconds);
        }
        public void restore(JSONObject value, long nowSeconds) {
            if (value == null || nowSeconds - value.optLong("savedAt") < 0 || nowSeconds - value.optLong("savedAt") > 300) return;
            key = value.optString("key"); timestamp = value.optLong("timestamp"); position = value.optLong("position");
            listened = Math.max(0, Math.min(86400000, value.optLong("listened"))); submitted = value.optBoolean("submitted");
            playing = false; // Never credit time when the process was stopped.
        }
        public long listened() { return listened; }
        public void pause() { playing = false; }
    }

    /** Validate the whole response before removing any durable listens, including batches sent during new playback. */
    public static JSONObject acknowledge(JSONObject data, List<JSONObject> batch, JSONObject result) throws Exception {
        JSONObject scrobbles = result == null ? null : result.optJSONObject("scrobbles");
        Object rows = scrobbles == null ? null : scrobbles.opt("scrobble");
        JSONArray entries = rows instanceof JSONArray ? (JSONArray) rows : rows instanceof JSONObject ? new JSONArray().put(rows) : new JSONArray();
        if (entries.length() != batch.size()) throw new java.io.IOException("Incomplete Last.fm response");
        JSONObject next = new JSONObject(data.toString()); int ignored = 0;
        for (int i = 0; i < entries.length(); i++) {
            int code = entries.getJSONObject(i).getJSONObject("ignoredMessage").getInt("code");
            if (code < 0 || code > 5) throw new java.io.IOException("Invalid Last.fm acknowledgement");
            if (code == 0) next.put("lastScrobble", batch.get(i).optString("artist") + " — " + batch.get(i).optString("track"));
            else ignored++;
        }
        JSONArray queue = data.optJSONArray("queue"), remaining = new JSONArray();
        if (queue != null) for (int i = 0; i < queue.length(); i++) {
            JSONObject event = queue.getJSONObject(i); boolean sent = false;
            for (JSONObject item : batch) if (event.optLong("timestamp") == item.optLong("timestamp")
                && event.optString("artist").equals(item.optString("artist")) && event.optString("track").equals(item.optString("track"))
                && event.optString("album").equals(item.optString("album"))) { sent = true; break; }
            if (!sent) remaining.put(event);
        }
        return next.put("queue", remaining).put("ignored", ignored);
    }
}
