const CACHE_NAME = "stagebuilder-v3";

// Service Worker 설치
self.addEventListener("install", (event) => {
  // 설치 즉시 활성화
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener("activate", (event) => {
  // 활성화 즉시 클라이언트 제어 시작
  event.waitUntil(clients.claim());
});

// 요청 처리
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // chrome-extension 스키마 요청은 캐시하지 않음
  if (request.url.startsWith("chrome-extension://")) {
    event.respondWith(fetch(request));
    return;
  }

  // 외부(크로스 오리진) 리소스는 캐시 로직에서 제외
  // - CORS 실패/리다이렉트/opaque 응답 등으로 cache.put 단계에서 문제를 만들 수 있음
  // - 특히 대용량 FBX 등을 외부 호스팅(R2 등)에서 받을 때는 네트워크로만 처리
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
      event.respondWith(
        fetch(request).catch(() => new Response("Network error", { status: 502 })),
      );
      return;
    }
  } catch (e) {}

  // 비디오 파일이나 Range 요청인 경우 네트워크에서 직접 로드
  if (
    request.url.includes("/files/video.mp4") ||
    request.headers.has("range")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // 다른 리소스는 네트워크 우선 전략 사용
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 성공적인 응답만 캐시에 저장 (206 응답 제외)
        if (response.ok && response.status !== 206) {
          const responseToCache = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => {
              try {
                cache.put(request, responseToCache);
              } catch (error) {
                console.warn("캐시 저장 실패:", error);
              }
            })
            .catch((error) => {
              console.warn("캐시 열기 실패:", error);
            });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 요청 실패 시 캐시에서 응답 시도
        // caches.match가 없으면 undefined가 되어 respondWith가 터질 수 있어, 항상 Response를 반환
        return caches.match(request).then((cached) => {
          return cached || new Response("Offline", { status: 504 });
        });
      }),
  );
});
