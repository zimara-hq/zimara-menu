document.querySelector('#retry').addEventListener('click', () => location.reload());
function connectionStatus() {
  document.querySelector('#connection').textContent = navigator.onLine
    ? 'الشبكة متصلة، أعد المحاولة للتحقق من الخدمة. · Network connected. Retry to check the service.'
    : 'لا يوجد اتصال بالشبكة. · No network connection.';
}
window.addEventListener('online', connectionStatus);
window.addEventListener('offline', connectionStatus);
connectionStatus();
