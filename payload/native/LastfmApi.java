package dev.sparklecat.music;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.TreeMap;
import org.json.JSONObject;

/** Official Last.fm API. Secrets are used for signing, never sent in the request or error messages. */
public final class LastfmApi {
    public static final class Failure extends IOException {
        public final int code;
        public Failure(int code, String message) { super(message); this.code = code; }
        public boolean retryable() { return code == 0 || code == 8 || code == 11 || code == 16 || code == 29; }
        public boolean reconnect() { return code == 4 || code == 9 || code == 10 || code == 13 || code == 26; }
    }
    public interface Transport { JSONObject request(Map<String, String> parameters, boolean post) throws Exception; }
    private final Transport transport;
    public LastfmApi() { this(LastfmApi::request); }
    public LastfmApi(Transport transport) { this.transport = transport; }

    public static String signature(Map<String, String> parameters, String secret) throws Exception {
        StringBuilder raw = new StringBuilder();
        for (Map.Entry<String, String> entry : new TreeMap<>(parameters).entrySet()) {
            if (!entry.getKey().equals("format") && !entry.getKey().equals("callback")) raw.append(entry.getKey()).append(entry.getValue());
        }
        byte[] digest = MessageDigest.getInstance("MD5").digest(raw.append(secret).toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(); for (byte value : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return hex.toString();
    }
    public JSONObject call(String method, Map<String, String> arguments, String key, String secret, String session) throws Exception {
        Map<String, String> params = new TreeMap<>(arguments);
        params.put("method", method); params.put("api_key", key);
        if (!session.isEmpty()) params.put("sk", session);
        params.put("api_sig", signature(params, secret)); params.put("format", "json");
        JSONObject result = transport.request(params, !method.startsWith("auth."));
        int code = result.optInt("error");
        if (code != 0) throw new Failure(code, errorMessage(code));
        return result;
    }
    public static String errorMessage(int code) {
        if (code == 14 || code == 15) return "Approve access in your browser, then finish connecting. If the token expired, start again.";
        if (code == 4 || code == 9) return "Last.fm access was revoked. Disconnect and connect your account again.";
        if (code == 10 || code == 13 || code == 26) return "Last.fm rejected the API key or signature. Disconnect and check your API key and shared secret.";
        if (code == 29) return "Last.fm is limiting requests. Queued listens will retry later.";
        if (code == 8 || code == 11 || code == 16) return "Last.fm is temporarily unavailable. Queued listens will retry later.";
        return "Last.fm rejected the request (error " + code + "). Check your connection settings.";
    }
    public static Map<String, String> trackParameters(JSONObject event) {
        Map<String, String> params = new TreeMap<>();
        params.put("artist", event.optString("artist")); params.put("track", event.optString("track"));
        if (!event.optString("album").isEmpty()) params.put("album", event.optString("album"));
        if (event.optLong("duration") > 0) params.put("duration", Long.toString(event.optLong("duration")));
        return params;
    }
    private static JSONObject request(Map<String, String> params, boolean post) throws Exception {
        StringBuilder form = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (form.length() > 0) form.append('&');
            form.append(URLEncoder.encode(entry.getKey(), "UTF-8")).append('=').append(URLEncoder.encode(entry.getValue(), "UTF-8"));
        }
        HttpURLConnection connection = (HttpURLConnection) new URL("https://ws.audioscrobbler.com/2.0/" + (post ? "" : "?" + form)).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "Sparklecat-Plural-Star-Mods");
        try {
            if (post) {
                byte[] body = form.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); }
            }
            int status = connection.getResponseCode();
            if (status == 429 || status >= 500) throw new Failure(status == 429 ? 29 : 16, errorMessage(status == 429 ? 29 : 16));
            if (status != 200) throw new Failure(status == 403 ? 4 : 6, "Last.fm returned HTTP " + status + ". Check your connection settings.");
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int read;
                while ((read = in.read(buffer)) != -1) { if (out.size() + read > 1048576) throw new IOException("Last.fm response too large"); out.write(buffer, 0, read); }
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }
}
