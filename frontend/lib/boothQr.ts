// 부스 QR 인쇄물 만들기.
// QR 아래에 부스 이름을 함께 그린다 — 인쇄물을 보는 사람은 어느 부스의 QR인지 알아야 하고,
// 코드 6자는 학생이 손으로 입력할 화면이 없어(진입 경로가 /b/<code> 링크뿐) 지면만 차지했다.

import QRCode from "qrcode";

const QR_SIZE = 1024;
const LINE_HEIGHT = 132;
const LABEL_PADDING = 44;
const MAX_FONT = 92;
// 라벨이 QR 폭에 닿지 않도록 남기는 여백. 축소 비율 계산이 정확히 선형은 아니라 조금 더 둔다.
const LABEL_MAX_WIDTH = QR_SIZE - 96;
const LABEL_FONT_STACK = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
// 한 줄이 이보다 길어지면 두 줄로 나눈다. 67개 중 19개가 18자를 넘고 최장이 34자라,
// 한 줄로 밀어 넣으면 긴 이름만 절반 크기로 작아진다.
const WRAP_THRESHOLD = 18;

/** 다운로드 파일명. 부스 이름에는 쉼표·물음표·느낌표가 섞여 있어 파일명에는 코드를 쓴다. */
export function boothQrFilename(code: string): string {
  return `booth-${code}.png`;
}

/**
 * 부스 이름을 최대 두 줄로 나눈다. 짧으면 한 줄 그대로.
 *
 * 공백에서만 끊는다. 공백이 없는 긴 이름은 나누지 않고 한 줄로 둔다 —
 * 단어 중간을 자르면 읽기 더 어렵다. 그런 이름은 폰트 축소가 받아준다.
 */
export function wrapBoothLabel(name: string): string[] {
  const text = name.trim();
  if (text.length <= WRAP_THRESHOLD || !text.includes(" ")) return [text];

  const words = text.split(" ");
  const half = text.length / 2;
  let head = words[0];
  let index = 1;
  // 절반 지점을 넘어서기 직전까지 앞줄에 담는다. 넘어선 뒤 더 가까우면 그 단어까지 가져간다.
  while (index < words.length - 1 && head.length + 1 + words[index].length <= half) {
    head += ` ${words[index]}`;
    index += 1;
  }
  return [head, words.slice(index).join(" ")];
}

/** 인쇄용 PNG data URL — QR + 부스 이름. 브라우저에서만 동작한다(canvas 사용). */
export async function renderBoothQrPng(qrUrl: string, name: string): Promise<string> {
  const lines = wrapBoothLabel(name);
  const labelHeight = LABEL_PADDING + lines.length * LINE_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE + labelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("QR 이미지를 만들지 못했어요.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // errorCorrectionLevel M — 32자 링크는 버전 3(29×29)에 들어간다.
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR 이미지를 만들지 못했어요."));
    image.src = qrDataUrl;
  });
  ctx.drawImage(image, 0, 0, QR_SIZE, QR_SIZE);

  // 가장 긴 줄을 기준으로 한 번 재고 비례 축소한다. 루프로 조금씩 줄이는 것과 결과가 같고 더 싸다.
  ctx.font = `bold ${MAX_FONT}px ${LABEL_FONT_STACK}`;
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const fontSize =
    widest > LABEL_MAX_WIDTH ? Math.floor((MAX_FONT * LABEL_MAX_WIDTH) / widest) : MAX_FONT;

  ctx.fillStyle = "#000000";
  ctx.font = `bold ${fontSize}px ${LABEL_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.fillText(line, QR_SIZE / 2, QR_SIZE + LABEL_PADDING / 2 + (index + 0.5) * LINE_HEIGHT);
  });

  return canvas.toDataURL("image/png");
}
