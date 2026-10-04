const KIOSK_PREFIX = "https://nabi-simulator.vercel.app/k/";

/** 페인트팜 키오스크 QR이면 POST할 주소(공백만 제거)를, 아니면 null. 번호 검사는 키오스크 서버가 한다. */
export function kioskCheckinUrl(value: string): string | null {
  const url = value.trim();
  return url.startsWith(KIOSK_PREFIX) ? url : null;
}

/** 학생 UUID를 키오스크로 한 번 보낸다. 5xx·8초 무응답·네트워크 오류는 1회만 재시도하고, 그래도 실패하면 503. */
export async function sendKioskCheckin(url: string, studentId: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      // 공용 request()는 Authorization을 붙이므로 쓰지 않는다 — 토큰이 외부 서버로 넘어가면 안 된다.
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId }),
        signal: ctl.signal,
      });
      if (res.status < 500) return res.status;
    } catch { /* 시간 초과·네트워크 오류 → 재시도 */ }
    finally { clearTimeout(timer); }
  }
  return 503;
}

export function kioskCheckinMessage(status: number): string {
  if (status === 200) return "접수됐어요. 키오스크 화면을 봐 주세요. 앞사람이 보고 있으면 끝난 뒤 이어서 떠요.";
  if (status === 400 || status === 404) return "키오스크 옆 직원에게 알려 주세요.";
  return "잠시 후 다시 찍어 주세요.";
}
