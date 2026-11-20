import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center bg-canvas p-6 text-right font-sans">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl border border-red-200 p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-red-100 pb-3">
              <span className="material-symbols-outlined text-3xl text-red-600">error</span>
              <div>
                <h2 className="font-bold text-base text-slate-900">حدث خطأ غير متوقع في الواجهة</h2>
                <p className="text-xs text-slate-500">تم إيقاف الشاشة مؤقتاً لتجنب فقدان البيانات</p>
              </div>
            </div>
            {this.state.error?.message && (
              <p className="text-xs font-mono bg-red-50 text-red-800 p-3 rounded-xl border border-red-200 break-words">
                {this.state.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer hover:bg-brand-deep"
              >
                إعادة تحميل الصفحة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
