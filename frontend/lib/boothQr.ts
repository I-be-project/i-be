// 부스 QR 인쇄물 만들기.
// QR 아래에 코드 6자를 함께 그린다 — 카메라가 안 잡힐 때 학생이 손으로 입력할 수 있어야
// 코드에서 혼동 문자(0/O, 1/I/L)를 뺀 설계가 의미를 갖는다.

import QRCode from "qrcode";

const QR_SIZE = 1024;
const LABEL_HEIGHT = 176;

/** 다운로드 파일명. 부스 이름은 파일명에 못 쓰는 문자가 섞일 수 있어 코드만 쓴다. */
export function boothQrFilename(code: string): string {
  return `booth-${code}.png`;
}

/** 인쇄용 PNG data URL — QR + 코드 라벨. 브라우저에서만 동작한다(canvas 사용). */
export async function renderBoothQrPng(
  qrUrl: string,
  code: string
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE + LABEL_HEIGHT;
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

  ctx.fillStyle = "#000000";
  ctx.font = "bold 104px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, QR_SIZE / 2, QR_SIZE + LABEL_HEIGHT / 2);

  return canvas.toDataURL("image/png");
}
