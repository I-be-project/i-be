import { isAllowedCardUrl } from "@/lib/cardImageUrl";

// 카드 이미지 저장용 같은 출처 프록시. S3 버킷에 CORS가 없어 브라우저가 서명 URL을 직접 받지 못하므로
// 서버가 대신 받아 그대로 돌려준다. 허용 주소는 lib/cardImageUrl의 S3 카드 경로뿐이다.
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedCardUrl(target)) return new Response("허용되지 않은 주소입니다.", { status: 400 });
  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return new Response("카드 이미지를 받지 못했습니다.", { status: 502 });
  return new Response(upstream.body, {
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "image/png", "Cache-Control": "private, no-store" },
  });
}
