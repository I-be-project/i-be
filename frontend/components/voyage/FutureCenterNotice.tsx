// 부스 방문 인증 화면 맨 아래(방문 기록하기·성장 확인하기 버튼 바로 위) 안내 —
// 체험으로 쌓은 역량이 반영된 미래 모습을 유성구미래교육지원센터 부스에서 확인하게 이끈다.
// 테두리·그라데이션 없이 단색 면으로 둔다. 아래 파란 버튼과 겹치지 않게 따뜻한 색.

export function FutureCenterNotice() {
  return (
    <section
      aria-label="유성구미래교육지원센터 부스 안내"
      className="mb-4 rounded-2xl bg-[#FFEFC2] px-5 py-4"
    >
      <p className="break-keep text-lg font-black leading-snug text-[#3D2A00]">
        더 멋져진 내 미래 모습,
        <br />
        직접 확인해볼래?
      </p>
      <p className="mt-2 break-keep text-[14px] font-semibold leading-relaxed text-[#5C4410]">
        체험하며 쌓은 역량이 미래의 나를 어떻게 바꿨는지
        <br />
        <span className="whitespace-nowrap font-black text-[#3D2A00] underline decoration-[#F0BE48] decoration-[3px] underline-offset-4">
          유성구미래교육지원센터 부스
        </span>
        에서 확인할 수 있어요.
      </p>
    </section>
  );
}
