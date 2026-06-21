import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, ImageIcon, MessagesSquare, Workflow } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface DevTool {
  title: string
  description: string
  href?: string
  tag: string
  icon: LucideIcon
  status: "active" | "soon"
}

const DEV_TOOLS: DevTool[] = [
  {
    title: "카드 생성 흐름 (mock→실제)",
    description:
      "mock 질문/페르소나 선택을 버튼으로 진행한 뒤, 실제 AI로 인물·배경 이미지를 생성해 카드까지 만듭니다.",
    href: "/dev/flow",
    tag: "흐름",
    icon: Workflow,
    status: "active",
  },
  {
    title: "페르소나 카드 생성",
    description:
      "프롬프트·페르소나 정보로 인물·배경 그림을 만들고 글자·QR까지 합성한 완성 카드를 생성합니다.",
    href: "/dev/image-test",
    tag: "이미지",
    icon: ImageIcon,
    status: "active",
  },
  {
    title: "페르소나 해석 테스트",
    description: "학생 답변을 AI가 해석해 페르소나 결과로 변환하는 흐름을 점검합니다.",
    tag: "AI",
    icon: MessagesSquare,
    status: "soon",
  },
  {
    title: "세션 플로우 테스트",
    description: "질문 진행·답변 저장·다음 질문 생성까지 세션 API 흐름을 점검합니다.",
    tag: "세션",
    icon: Workflow,
    status: "soon",
  },
]

export default function DevIndexPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <Badge variant="secondary" className="mb-3">
          dev
        </Badge>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">개발 도구</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          백엔드 기능을 직접 호출해 확인하는 개발용 테스트 모음입니다. 카드를 선택해
          들어가세요.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {DEV_TOOLS.map((tool) => (
          <ToolCard key={tool.title} tool={tool} />
        ))}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: DevTool }) {
  const { title, description, href, tag, icon: Icon, status } = tool
  const isActive = status === "active" && href

  const body = (
    <Card
      className={cn(
        "h-full transition",
        isActive
          ? "hover:border-primary/50 hover:shadow-md cursor-pointer"
          : "opacity-60",
      )}
    >
      <CardContent className="flex h-full flex-col gap-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
            <Icon className="size-5 text-foreground/80" />
          </div>
          <Badge variant="outline" className="text-xs">
            {tag}
          </Badge>
        </div>
        <div className="text-base font-semibold">{title}</div>
        <p className="flex-1 text-sm text-muted-foreground">{description}</p>
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {isActive ? (
            <>
              열기 <ArrowRight className="size-3.5" />
            </>
          ) : (
            "준비 중"
          )}
        </div>
      </CardContent>
    </Card>
  )

  return isActive ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    <div aria-disabled>{body}</div>
  )
}
