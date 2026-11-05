package dev.sparklecat.music;

import android.service.notification.NotificationListenerService;

/** Grants MediaSessionManager access. Notification contents are never collected. */
public final class MusicNotificationListener extends NotificationListenerService {
    @Override public void onListenerConnected() { super.onListenerConnected(); LastfmScrobbler.get(this).service(true); }
    @Override public void onListenerDisconnected() { LastfmScrobbler.get(this).service(false); super.onListenerDisconnected(); }
    @Override public void onDestroy() { LastfmScrobbler.get(this).service(false); super.onDestroy(); }
}
