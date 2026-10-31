package app.notifee.core;

import java.util.Calendar;
import java.util.TimeZone;

/** Local-clock quiet hours, evaluated at delivery even without a running JS runtime. */
final class RestMode {
  private static boolean isResting(int start, int end, Calendar clock) {
    int minute = clock.get(Calendar.HOUR_OF_DAY) * 60 + clock.get(Calendar.MINUTE);
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
  }

  // -1 means suppress; otherwise return the lifetime until the next rest period.
  static long untilStart(int start, int end, long now) {
    if (start < 0 || start >= 1440 || end < 0 || end >= 1440 || start == end) return -1;
    Calendar clock = Calendar.getInstance();
    clock.setTimeInMillis(now);
    if (isResting(start, end, clock)) return -1;
    clock.set(Calendar.HOUR_OF_DAY, start / 60);
    clock.set(Calendar.MINUTE, start % 60);
    clock.set(Calendar.SECOND, 0);
    clock.set(Calendar.MILLISECOND, 0);
    // Try today's remaining occurrence before advancing the date.
    if (clock.getTimeInMillis() <= now) {
      clock.add(Calendar.DATE, 1);
      clock.set(Calendar.HOUR_OF_DAY, start / 60);
      clock.set(Calendar.MINUTE, start % 60);
    }
    // Calendar chooses the second occurrence when the local clock repeats.
    Calendar yesterday = (Calendar) clock.clone();
    yesterday.add(Calendar.DATE, -1);
    long boundary = clock.getTimeInMillis();
    long first = boundary + clock.getTimeZone().getOffset(boundary)
        - yesterday.getTimeZone().getOffset(yesterday.getTimeInMillis());
    Calendar earlier = (Calendar) clock.clone();
    earlier.setTimeInMillis(first);
    if (first > now && first < boundary
        && earlier.get(Calendar.YEAR) == clock.get(Calendar.YEAR)
        && earlier.get(Calendar.DAY_OF_YEAR) == clock.get(Calendar.DAY_OF_YEAR)
        && earlier.get(Calendar.HOUR_OF_DAY) == clock.get(Calendar.HOUR_OF_DAY)
        && earlier.get(Calendar.MINUTE) == clock.get(Calendar.MINUTE)) boundary = first;

    // The clock jump itself can enter rest before a normalized, nonexistent start.
    TimeZone zone = clock.getTimeZone();
    int offset = zone.getOffset(now);
    if (zone.getOffset(boundary) != offset) {
      long before = now;
      long after = boundary;
      while (after - before > 1) {
        long middle = before + (after - before) / 2;
        if (zone.getOffset(middle) == offset) before = middle;
        else after = middle;
      }
      clock.setTimeInMillis(after);
      if (isResting(start, end, clock)) boundary = after;
    }
    clock.setTimeInMillis(boundary);
    // An entirely skipped window has no start today; continue to the next real one.
    if (!isResting(start, end, clock)) return boundary - now + untilStart(start, end, boundary);
    return boundary - now;
  }
}
