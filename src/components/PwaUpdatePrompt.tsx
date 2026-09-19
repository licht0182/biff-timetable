import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!offlineReady) return
    const timeout = window.setTimeout(() => setOfflineReady(false), 3500)
    return () => window.clearTimeout(timeout)
  }, [offlineReady, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  return <aside className="pwa-update-toast" role="status" aria-live="polite">
    <div><strong>{needRefresh ? '새 버전이 준비되었습니다.' : '오프라인에서도 앱을 열 수 있습니다.'}</strong><span>{needRefresh ? '지금 새로고침하면 최신 화면을 사용할 수 있습니다.' : '상영 데이터는 연결 상태에 따라 최신 정보로 갱신됩니다.'}</span></div>
    {needRefresh && <button type="button" onClick={() => void updateServiceWorker(true)}>업데이트</button>}
    <button type="button" className="pwa-update-close" aria-label="알림 닫기" onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}>×</button>
  </aside>
}
