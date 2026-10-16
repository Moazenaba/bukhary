interface ErrorReportPayload {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  url: string;
  userAgent: string;
  timestamp: string;
  extra?: Record<string, any>;
}

export class ErrorReporter {
  private static reportUrl: string | undefined =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ERROR_REPORT_URL) ||
    (typeof window !== 'undefined' ? (window as any).ERROR_REPORT_URL : undefined);

  private static sentryDsn: string | undefined =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SENTRY_DSN) ||
    (typeof window !== 'undefined' ? (window as any).SENTRY_DSN : undefined);

  static init() {
    if (typeof window === 'undefined') return;

    window.onerror = (message, source, lineno, colno, error) => {
      this.report({
        message: String(message),
        stack: error?.stack,
        source,
        lineno,
        colno,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    window.onunhandledrejection = (event) => {
      const reason = event.reason;
      this.report({
        message: `Unhandled Rejection: ${reason?.message || String(reason)}`,
        stack: reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };
  }

  static setSentryDsn(dsn: string) {
    this.sentryDsn = dsn;
  }

  static setReportUrl(url: string) {
    this.reportUrl = url;
  }

  static report(payload: ErrorReportPayload) {
    console.error('🚨 [Web Error Caught]:', payload);

    // 1. إرسال إلى ERROR_REPORT_URL إذا كان مضبوطاً
    if (this.reportUrl) {
      try {
        fetch(this.reportUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'no-cors',
        }).catch(() => {});
      } catch {
        // Silent catch
      }
    }

    // 2. إرسال إلى Sentry إذا تم تزويد الـ DSN
    if (this.sentryDsn) {
      try {
        const match = this.sentryDsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
        if (match) {
          const [, publicKey, host, projectId] = match;
          const sentryUrl = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`;
          fetch(sentryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id: Math.random().toString(36).substring(2, 18),
              message: payload.message,
              platform: 'javascript',
              timestamp: new Date().toISOString(),
              level: 'error',
              extra: payload,
            }),
          }).catch(() => {});
        }
      } catch {
        // Silent catch
      }
    }
  }
}
