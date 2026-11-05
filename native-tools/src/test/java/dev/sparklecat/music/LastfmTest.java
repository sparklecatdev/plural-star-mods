package dev.sparklecat.music;

import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class LastfmTest {
    private static LastfmCore.Track track(long duration, long position, boolean playing) {
        return new LastfmCore.Track("test-player", "Song", "Artist", "Album", duration, position, playing);
    }
    private static JSONObject event(String title, long timestamp) throws Exception {
        return new JSONObject().put("artist", "Artist").put("track", title).put("album", "Album")
            .put("duration", 180).put("timestamp", timestamp);
    }
    private static JSONObject response(int... codes) throws Exception {
        JSONArray rows = new JSONArray();
        for (int code : codes) rows.put(new JSONObject().put("ignoredMessage", new JSONObject().put("code", Integer.toString(code))));
        return new JSONObject().put("scrobbles", new JSONObject().put("scrobble", rows));
    }

    @Test public void countsRealPlaybackOnceAtHalfLengthWithOriginalTimestamp() throws Exception {
        LastfmCore.Tracker tracker = new LastfmCore.Tracker();
        assertNull(tracker.tick(track(180000, 0, true), 0, 1700000000));
        for (int ms = 2000; ms < 90000; ms += 2000) assertNull(tracker.tick(track(180000, ms, true), ms, 1700000000 + ms / 1000));
        JSONObject listen = tracker.tick(track(180000, 90000, true), 90000, 1700000090);
        assertEquals("Song", listen.getString("track"));
        assertEquals(1700000000, listen.getLong("timestamp"));
        assertEquals(180, listen.getLong("duration"));
        assertNull(tracker.tick(track(180000, 92000, true), 92000, 1700000092));
    }

    @Test public void pausesSeeksStuckSessionsAndMissingObservationsDoNotEarnTime() throws Exception {
        LastfmCore.Tracker tracker = new LastfmCore.Tracker();
        tracker.tick(track(180000, 0, true), 0, 1000);
        tracker.tick(track(180000, 2000, true), 2000, 1002);
        tracker.tick(track(180000, 2000, false), 4000, 1004);
        tracker.tick(track(180000, 2000, true), 100000, 1100);
        tracker.tick(track(180000, 150000, true), 102000, 1102); // seek
        tracker.tick(track(180000, 150000, true), 104000, 1104); // stuck
        tracker.tick(track(180000, 152000, true), 106000, 1106);
        assertEquals(4000, tracker.listened());
        tracker.tick(null, 108000, 1108);
        tracker.tick(track(180000, 154000, true), 110000, 1110);
        tracker.pause();
        tracker.tick(track(180000, 156000, true), 112000, 1112);
        tracker.tick(track(180000, 176000, true), 132000, 1132); // polling gap
        assertEquals(4000, tracker.listened());
    }

    @Test public void requiresMetadataAndOverThirtySecondsAndCapsThresholdAtFourMinutes() throws Exception {
        assertFalse(track(30000, 0, true).eligible());
        assertTrue(track(30001, 0, true).eligible());
        assertFalse(new LastfmCore.Track("", "Song", "", "", 180000, 0, true).eligible());
        assertEquals(240000, track(1200000, 0, true).threshold());
        LastfmCore.Tracker tracker = new LastfmCore.Tracker();
        tracker.tick(track(1200000, 0, true), 0, 1000);
        for (int ms = 10000; ms < 240000; ms += 10000) assertNull(tracker.tick(track(1200000, ms, true), ms, 1000 + ms / 1000));
        assertNotNull(tracker.tick(track(1200000, 240000, true), 240000, 1240));
    }

    @Test public void repeatedTrackStartsAnotherListenAndNewTrackResetsAccounting() throws Exception {
        LastfmCore.Tracker tracker = new LastfmCore.Tracker();
        tracker.tick(track(40000, 0, true), 0, 1000);
        for (int ms = 2000; ms <= 38000; ms += 2000) tracker.tick(track(40000, ms, true), ms, 1000 + ms / 1000);
        assertNull(tracker.tick(track(40000, 0, true), 40000, 1040));
        assertTrue(tracker.changed); assertEquals(0, tracker.listened());
        for (int ms = 2000; ms < 20000; ms += 2000) assertNull(tracker.tick(track(40000, ms, true), 40000 + ms, 1040 + ms / 1000));
        assertEquals(1040, tracker.tick(track(40000, 20000, true), 60000, 1060).getLong("timestamp"));
        tracker.tick(new LastfmCore.Track("test-player", "Other", "Artist", "Album", 40000, 0, true), 62000, 1062);
        assertEquals(0, tracker.listened()); assertTrue(tracker.changed);
    }

    @Test public void restartResumesCheckpointWithoutCreditingDowntimeOrDuplicatingSubmission() throws Exception {
        LastfmCore.Tracker before = new LastfmCore.Tracker();
        before.tick(track(40000, 0, true), 0, 1000);
        before.tick(track(40000, 10000, true), 10000, 1010);
        JSONObject saved = before.checkpoint(1010);
        LastfmCore.Tracker resumed = new LastfmCore.Tracker(); resumed.restore(saved, 1020);
        resumed.tick(track(40000, 20000, true), 20000, 1020);
        assertEquals(10000, resumed.listened());
        assertNotNull(resumed.tick(track(40000, 30000, true), 30000, 1030));
        LastfmCore.Tracker submitted = new LastfmCore.Tracker(); submitted.restore(resumed.checkpoint(1030), 1032);
        assertNull(submitted.tick(track(40000, 32000, true), 32000, 1032));
        assertNull(submitted.tick(track(40000, 34000, true), 34000, 1034));
        LastfmCore.Tracker stale = new LastfmCore.Tracker(); stale.restore(saved, 1400);
        stale.tick(track(40000, 20000, true), 20000, 1400); assertEquals(0, stale.listened());
        LastfmCore.Tracker future = new LastfmCore.Tracker(); future.restore(saved, 1000); assertEquals(0, future.listened());
    }

    @Test public void signingSortsRawUtf8ParametersAndExcludesFormatAndCallback() throws Exception {
        Map<String, String> params = Map.of("track", "Jóga", "artist", "Björk", "timestamp", "1700000000", "sk", "secondsession",
            "method", "track.scrobble", "api_key", "example", "format", "json", "callback", "ignored");
        assertEquals("08e15f335eedee006380b4bd37d37537", LastfmApi.signature(params, "unit-test-secret"));
    }

    @Test public void authenticationUsesGetAndScrobblingUsesSignedPostWithoutSendingSecret() throws Exception {
        LastfmApi api = new LastfmApi((params, post) -> {
            assertEquals(!params.get("method").startsWith("auth."), post);
            assertEquals("json", params.get("format")); assertEquals("public-key", params.get("api_key"));
            assertFalse(params.containsKey("secret")); assertFalse(params.containsValue("unit-test-secret"));
            Map<String, String> unsigned = new java.util.TreeMap<>(params); unsigned.remove("api_sig");
            assertEquals(LastfmApi.signature(unsigned, "unit-test-secret"), params.get("api_sig"));
            return new JSONObject();
        });
        api.call("auth.getToken", Map.of(), "public-key", "unit-test-secret", "");
        api.call("auth.getSession", Map.of("token", "token"), "public-key", "unit-test-secret", "");
        api.call("track.scrobble", Map.of("artist[0]", "Björk", "track[0]", "Jóga"), "public-key", "unit-test-secret", "session");
    }

    @Test public void apiErrorsInsideSuccessfulHttpResponsesAreClassifiedAndSanitized() throws Exception {
        for (int code : new int[]{8, 11, 16, 29, 9, 10, 13, 14, 15, 26}) {
            LastfmApi api = new LastfmApi((params, post) -> new JSONObject().put("error", code).put("message", "private-server-message"));
            LastfmApi.Failure failure = assertThrows(LastfmApi.Failure.class, () -> api.call("track.scrobble", Map.of(), "key", "secret", "session"));
            assertEquals(code, failure.code); assertFalse(failure.getMessage().contains("private-server-message"));
            assertEquals(code == 8 || code == 11 || code == 16 || code == 29, failure.retryable());
            assertEquals(code == 9 || code == 10 || code == 13 || code == 26, failure.reconnect());
        }
    }

    @Test public void acknowledgesOnlySentEventsEvenIfOldestQueuedEventsWereEvictedDuringUpload() throws Exception {
        JSONObject first = event("First", 1000), second = event("Second", 1200), newer = event("New", 1400);
        JSONObject data = new JSONObject().put("queue", new JSONArray().put(second).put(newer));
        JSONObject next = LastfmCore.acknowledge(data, List.of(first, second), response(0, 3));
        assertEquals(1, next.getJSONArray("queue").length());
        assertEquals("New", next.getJSONArray("queue").getJSONObject(0).getString("track"));
        assertEquals("Artist — First", next.getString("lastScrobble")); assertEquals(1, next.getInt("ignored"));
        assertEquals(2, data.getJSONArray("queue").length()); assertFalse(data.has("lastScrobble"));
        JSONObject single = response(0); single.getJSONObject("scrobbles").put("scrobble", single.getJSONObject("scrobbles").getJSONArray("scrobble").getJSONObject(0));
        assertEquals(0, LastfmCore.acknowledge(new JSONObject().put("queue", new JSONArray().put(first)), List.of(first), single).getJSONArray("queue").length());
    }

    @Test public void incompleteOrMalformedAcknowledgementsNeverDeleteDurableQueue() throws Exception {
        JSONObject first = event("First", 1000), second = event("Second", 1200);
        JSONObject data = new JSONObject().put("queue", new JSONArray().put(first).put(second)); String original = data.toString();
        for (JSONObject result : new JSONObject[]{response(0), response(0, 99), new JSONObject(), null,
            new JSONObject().put("scrobbles", new JSONObject().put("scrobble", new JSONArray().put(new JSONObject()).put(new JSONObject())))}) {
            assertThrows(Exception.class, () -> LastfmCore.acknowledge(data, List.of(first, second), result));
            assertEquals(original, data.toString());
        }
    }
}
