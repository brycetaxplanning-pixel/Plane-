/* Shared by the service worker and by the tests. Plain script, no modules, so
   `importScripts` can pull it into a classic worker.

   Everything here is pure: given the wakes stored on this device and the time,
   it decides what a notification should say. The service worker does the
   IndexedDB reading and the showing; this does the thinking, where it can be
   tested. */

(function (root) {
  /** How late a wake can be and still be worth showing. A push held up by an
   *  hour is still useful; one held up by six is noise. */
  var GRACE_MS = 3 * 60 * 60 * 1000;
  /** How far ahead to pull in wakes that are nearly due, so two things twenty
   *  minutes apart arrive as one notification rather than two buzzes. */
  var LOOKAHEAD_MS = 30 * 60 * 1000;

  function pickWakes(wakes, now) {
    return (wakes || [])
      .filter(function (w) { return w && typeof w.at === 'number'; })
      .filter(function (w) { return w.at <= now + LOOKAHEAD_MS && w.at > now - GRACE_MS; })
      .sort(function (a, b) { return a.at - b.at; });
  }

  /** Turns the due wakes into one notification. Several at once become a count
   *  with the first named, rather than a stack of buzzes. */
  function buildNotification(wakes, now) {
    var due = pickWakes(wakes, now);
    if (due.length === 0) return null;

    var first = due[0];
    if (due.length === 1) {
      return {
        title: first.title,
        body: first.body || '',
        tag: first.tag || 'plane',
        data: { to: first.to || 'launcher', tab: first.tab || null },
      };
    }

    return {
      title: first.title,
      body: due.length === 2
        ? 'and ' + due[1].title
        : 'and ' + (due.length - 1) + ' other things due',
      tag: 'plane-digest',
      data: { to: 'tracker', tab: 'timeline' },
    };
  }

  /** Where a tapped notification should land. */
  function urlFor(data, base) {
    var to = (data && data.to) || 'launcher';
    var tab = data && data.tab;
    return base + '#/' + (to === 'launcher' ? '' : to) + (tab ? '?tab=' + tab : '');
  }

  root.PlaneNotify = {
    pickWakes: pickWakes,
    buildNotification: buildNotification,
    urlFor: urlFor,
    GRACE_MS: GRACE_MS,
    LOOKAHEAD_MS: LOOKAHEAD_MS,
  };
})(typeof self !== 'undefined' ? self : this);
