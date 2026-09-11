import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // 개발 서버를 LAN의 다른 기기(휴대폰 등)에서 열 수 있게 허용. dev 전용 설정.
  // Next는 세그먼트 수가 같아야 매칭하고 단독 "*"는 무시하므로 IPv4 4칸과 .local을 나열한다.
  allowedDevOrigins: ["*.*.*.*", "*.local"],
  images: {
    // 소스는 WebP지만, Next 이미지 최적화가 기기별로 AVIF/WebP를 골라 재인코딩한다.
    formats: ["image/avif", "image/webp"],
    // 풀블리드 장면은 모바일 폭 위주 — 과도하게 큰 변형을 만들지 않도록 상한을 둔다.
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 256, 384],
    // 최적화 결과 캐시 유지(초기 최적화 비용 1회로 줄임).
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
