// Capability checks are deliberately separate from permission prompts and subscriptions.
export function mobileReadiness({ secure = false, serviceWorker = false, pushManager = false, notificationPermission = 'unsupported', ios = false, standalone = false, online = true } = {}) {
  return {
    canRegister: secure && serviceWorker,
    installed: standalone,
    online,
    install: standalone ? 'installed' : ios ? 'ios-home-screen' : 'browser-menu',
    notifications: !secure || !serviceWorker || !pushManager || notificationPermission === 'unsupported'
      ? 'unsupported'
      : ios && !standalone ? 'install-required'
      : notificationPermission === 'denied' ? 'blocked'
      : notificationPermission === 'granted' ? 'permission-granted' : 'permission-required',
  };
}

export function readMobileEnvironment(win = window) {
  const nav = win.navigator;
  return {
    secure: win.isSecureContext,
    serviceWorker: 'serviceWorker' in nav,
    pushManager: 'PushManager' in win,
    notificationPermission: win.Notification?.permission || 'unsupported',
    ios: /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1),
    standalone: Boolean(win.matchMedia('(display-mode: standalone)').matches || nav.standalone),
    online: nav.onLine !== false,
  };
}
