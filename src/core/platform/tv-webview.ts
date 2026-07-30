/**
 * Is this a TV webview (webOS, Tizen, or a generic SmartTV browser)?
 *
 * Deliberately *not* a fourth platform branch. `create-platform.ts`'s own
 * rule stands — a packaged webOS build is the web platform — and nothing
 * here changes which adapters get built. This exists only so a *capability*
 * can report the truth about a TV (`capabilities.ts`'s "the UI's gate is a
 * capability check rather than an environment check"), rather than every
 * consumer sniffing user agents for itself.
 *
 * Detection order matters. The injected globals are what the platform's own
 * SDK provides and are unambiguous; the user-agent match is the fallback for
 * a webview that has not run its bootstrap yet, or a set-top box that is
 * neither LG nor Samsung. `Web0S` really is spelled with a zero in LG's user
 * agent, alongside the `webOS.TV` form on newer firmware — both are matched.
 */
const TV_USER_AGENT = /web0s|webos\.tv|tizen|smarttv|smart-tv|hbbtv|netcast|viera|bravia|aftb|crkey/i;

interface TvGlobals {
    webOS?: unknown;
    webOSSystem?: unknown;
    tizen?: unknown;
}

export function isTvWebview(): boolean {
    if (typeof window === 'undefined') return false;
    const globals = window as unknown as TvGlobals;
    if (globals.webOS !== undefined || globals.webOSSystem !== undefined || globals.tizen !== undefined) return true;
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return TV_USER_AGENT.test(ua);
}
