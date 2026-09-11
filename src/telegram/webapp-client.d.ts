export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        version: string;
        platform: string;
        colorScheme: "light" | "dark";
        ready(): void;
        expand(): void;
        close(): void;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
        showPopup(params: {
          title?: string;
          message: string;
          buttons?: Array<{ id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }>;
        }): void;
        HapticFeedback?: {
          impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
          selectionChanged(): void;
        };
      };
    };
  }
}
