import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.ae81de182d61430daa24885b04c84a6b',
  appName: 'أداة تعريب زيلدا',
  webDir: 'dist',
  // server.url يجعل التطبيق يحمّل من Lovable dev preview بدل webDir المحلي.
  // مفيد للتطوير السريع فقط — احذفه قبل بناء APK للإنتاج.
  server: {
    url: 'https://ae81de18-2d61-430d-aa24-885b04c84a6b.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config;
