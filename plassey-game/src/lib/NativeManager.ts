
export class NativeManager {
  /**
   * Request necessary background permissions for Android.
   */
  public static async requestBackgroundPermissions(): Promise<void> {
    const isNative = !!(window as any).cordova;
    if (!isNative) return;

    document.addEventListener('deviceready', async () => {
      console.log('[NATIVE] Device Ready - Initializing Mobile Setup...');
      try {
        await this.requestNotificationPermission();
        await this.requestBatteryOptimizationExclusion();
      } catch (err) {
        console.error('[NATIVE] Permission request failed:', err);
      }
    }, false);
  }

  private static async requestNotificationPermission(): Promise<void> {
    const permissions = (window as any).cordova?.plugins?.permissions;
    if (!permissions) return;

    // POST_NOTIFICATIONS is required for Android 13+ (API 33+)
    const permission = permissions.POST_NOTIFICATIONS;
    if (!permission) return;

    return new Promise((resolve) => {
      permissions.checkPermission(permission, (status: any) => {
        if (!status.hasPermission) {
          permissions.requestPermission(permission, (s: any) => {
            console.log('[NATIVE] Notification permission status:', s.hasPermission);
            resolve();
          }, () => resolve());
        } else {
          resolve();
        }
      }, () => resolve());
    });
  }

  private static async requestBatteryOptimizationExclusion(): Promise<void> {
    const bgMode = (window as any).cordova?.plugins?.backgroundMode;
    if (!bgMode) return;

    try {
      // Basic background mode activation
      if (typeof bgMode.enable === 'function') bgMode.enable();
      if (typeof bgMode.unlock === 'function') bgMode.unlock();
      
      bgMode.disableWebViewOptimizations();
    } catch (e) {
      console.warn('[NATIVE] Background setup skipped:', e);
    }
  }
}
