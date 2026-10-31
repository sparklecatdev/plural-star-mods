package app.notifee.core;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import app.notifee.core.event.NotificationEvent;
import app.notifee.core.model.NotificationModel;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

public final class RestModeHook {
    public static ListenableFuture<?> beforeDisplay(NotificationModel model, Bundle trigger, NotificationCompat.Builder builder) {
        SharedPreferences rest = ContextHolder.getApplicationContext().getSharedPreferences("plural_star_rest", Context.MODE_PRIVATE);
        long untilRest = rest.getBoolean("enabled", false)
            ? RestMode.untilStart(rest.getInt("start", -1), rest.getInt("end", -1), System.currentTimeMillis()) : 0;
        if (!rest.getBoolean("notifications", true) || untilRest < 0) {
            if (trigger != null) EventBus.post(new NotificationEvent(3, model));
            return Futures.immediateFuture(null);
        }
        if (untilRest > 0) {
            Long timeout = model.getAndroid().getTimeoutAfter();
            builder.setTimeoutAfter(timeout != null && timeout > 0 ? Math.min(timeout, untilRest) : untilRest);
        }
        return null;
    }
}
