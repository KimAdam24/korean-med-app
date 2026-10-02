/**
 * An in-memory expo-notifications, and the app's own `DoseAlarms` module.
 *
 * Models what the reminder code depends on the real one for: a permission that
 * can be undecided, refused, or refused for good; a schedule that can be
 * written, read back and cancelled by identifier, where writing an identifier
 * again replaces it; the next firing of a daily trigger, on the local clock;
 * and a tapped notification, delivered both to listeners and as "the last
 * response" for an app the tap launched.
 *
 * `dropNextSchedule` makes the phone accept a schedule call and not keep it —
 * the silent loss the read-back exists to catch.
 */
type Permission = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
  ios: { status: number; allowsSound?: boolean | null };
};
type Request = { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> };
type Response = { actionIdentifier: string; notification: { request: Request } };

export const AndroidImportance = { NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 } as const;
export const AndroidNotificationVisibility = { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3 } as const;
export const IosAuthorizationStatus = {
  NOT_DETERMINED: 0,
  DENIED: 1,
  AUTHORIZED: 2,
  PROVISIONAL: 3,
  EPHEMERAL: 4,
} as const;
export const SchedulableTriggerInputTypes = {
  CALENDAR: 'calendar',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  DATE: 'date',
  TIME_INTERVAL: 'timeInterval',
} as const;
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

const ALLOWED: Permission = { granted: true, canAskAgain: true, status: 'granted', ios: { status: 2 } };
const UNDECIDED: Permission = { granted: false, canAskAgain: true, status: 'undetermined', ios: { status: 0 } };
const REFUSED: Permission = { granted: false, canAskAgain: false, status: 'denied', ios: { status: 1 } };

const state = {
  permission: ALLOWED as Permission,
  answer: null as Permission | null,
  requests: 0,
  scheduled: new Map<string, Request>(),
  channels: new Map<string, Record<string, unknown>>(),
  /** The user's own changes to a channel, in the phone's settings: these win over the app's. */
  channelChanges: new Map<string, { importance?: number; sound?: 'default' | null }>(),
  dropSchedules: 0,
  lastResponse: null as Response | null,
  listeners: [] as ((response: Response) => void)[],
  handlerSet: false,
  /** What the app said to do with a notification that arrives while it is open. */
  handler: null as null | { handleNotification: () => Promise<Record<string, boolean>> },
};

export function setNotificationHandler(handler: unknown): void {
  state.handlerSet = true;
  state.handler = handler as typeof state.handler;
}

export async function setNotificationChannelAsync(id: string, channel: Record<string, unknown>) {
  state.channels.set(id, channel);
  return channel;
}

/**
 * A channel as the phone serialises it. Its sound is 'default' when it was
 * made without one, and also when it names a file the app does not bundle
 * (expo-notifications 57 falls back to the default sound, after logging that
 * the file is missing); null only when made with `sound: null`. Whatever the
 * user changed in settings overrides what the app asked for.
 */
export async function getNotificationChannelAsync(id: string) {
  const made = state.channels.get(id);
  if (!made) return null;
  return {
    id,
    importance: made.importance,
    sound: 'sound' in made && made.sound === null ? null : ('default' as const),
    ...state.channelChanges.get(id),
  };
}

export async function getPermissionsAsync(): Promise<Permission> {
  return state.permission;
}

export async function requestPermissionsAsync(): Promise<Permission> {
  state.requests += 1;
  if (state.answer) state.permission = state.answer;
  return state.permission;
}

export async function scheduleNotificationAsync(request: Request): Promise<string> {
  if (state.dropSchedules > 0) {
    state.dropSchedules -= 1;
    return request.identifier;
  }
  state.scheduled.set(request.identifier, request);
  return request.identifier;
}

export async function getAllScheduledNotificationsAsync(): Promise<Request[]> {
  return [...state.scheduled.values()];
}

export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  state.scheduled.delete(identifier);
}

/** A daily trigger's next firing on the local clock, as both platforms compute it. */
export async function getNextTriggerDateAsync(trigger: { hour: number; minute: number }): Promise<number> {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), trigger.hour, trigger.minute);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export async function getLastNotificationResponseAsync(): Promise<Response | null> {
  return state.lastResponse;
}

export async function clearLastNotificationResponseAsync(): Promise<void> {
  state.lastResponse = null;
}

export function addNotificationResponseReceivedListener(listener: (response: Response) => void) {
  state.listeners.push(listener);
  return {
    remove() {
      state.listeners = state.listeners.filter((existing) => existing !== listener);
    },
  };
}

/** The app's DoseAlarms native module (Android exact alarms). */
export const doseAlarms = {
  exact: true,
  opened: 0,
  canScheduleExactAlarms(): boolean {
    return doseAlarms.exact;
  },
  openExactAlarmSettings(): boolean {
    doseAlarms.opened += 1;
    return true;
  },
};

export const notifications = {
  state,
  /** Notifications have never been asked for; the phone's question will be answered so. */
  notYetAsked(willAnswer: 'allow' | 'refuse'): void {
    state.permission = UNDECIDED;
    state.answer = willAnswer === 'allow' ? ALLOWED : REFUSED;
  },
  /** Turned off in the phone's settings; the app cannot ask again. */
  turnedOff(): void {
    state.permission = REFUSED;
    state.answer = null;
  },
  /**
   * The user turns the reminders' sound off in the phone's settings: on
   * Android the channel's sound, or its importance below the one that sounds;
   * on iOS the app's "Sounds" switch.
   */
  silencedBy(how: 'channel-sound' | 'channel-importance' | 'ios-sounds'): void {
    if (how === 'ios-sounds') {
      state.permission = { ...state.permission, ios: { ...state.permission.ios, allowsSound: false } };
    } else {
      state.channelChanges.set(
        'dose-reminders',
        how === 'channel-sound' ? { sound: null } : { importance: AndroidImportance.LOW }
      );
    }
  },
  allowed(): void {
    state.permission = ALLOWED;
  },
  dropNextSchedule(): void {
    state.dropSchedules += 1;
  },
  /** The phone forgets its alarms and keeps its list — Android's force-stop. */
  scheduledContents(): Record<string, unknown>[] {
    return [...state.scheduled.values()].map((request) => request.content);
  },
  /** The user taps a reminder: `launched` if it opened the app from closed. */
  tap(identifier: string, launched = false): void {
    const request = state.scheduled.get(identifier);
    if (!request) throw new Error(`No scheduled reminder ${identifier}.`);
    const response = { actionIdentifier: DEFAULT_ACTION_IDENTIFIER, notification: { request } };
    state.lastResponse = response;
    if (!launched) for (const listener of state.listeners) listener(response);
  },
  reset(): void {
    state.permission = ALLOWED;
    state.answer = null;
    state.requests = 0;
    state.scheduled.clear();
    state.channels.clear();
    state.channelChanges.clear();
    state.dropSchedules = 0;
    state.lastResponse = null;
    state.listeners = [];
    doseAlarms.exact = true;
    doseAlarms.opened = 0;
  },
};
