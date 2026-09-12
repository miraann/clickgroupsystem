// Opens a link in Capacitor's in-app browser (Chrome Custom Tab / SFSafariViewController)
// on native builds — it has its own close button and hands control straight back to the
// app, unlike `target="_blank"` which escapes to the system browser with no way back
// short of killing the app and re-entering the PIN. Falls back to a normal new tab on web.
export async function openInAppBrowser(url: string) {
  if (typeof window === 'undefined') return

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cap = (window as any)?.Capacitor
  const isNative: boolean = cap?.isNativePlatform?.() ?? cap?.isNative ?? false

  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    } catch {
      // fall through to the web path if the plugin isn't available
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
