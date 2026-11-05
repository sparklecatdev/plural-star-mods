package dev.sparklecat.music;

import android.service.notification.NotificationListenerService;

/** Grants MediaSessionManager access. Notification contents are never collected. */
public final class MusicNotificationListener extends NotificationListenerService {}
