import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, ImageIcon, UserRoundSearch } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DevTool {
  title: string
  description: string
  href: string
  tag: string
  icon: LucideIcon
}

const DEV_TOOLS: DevTool[] = [
  {
    title: "페르소나 생성",
    description:
      "DB에서 학생을 고르면 저장된 설문 답변으로 Career Persona를 만듭니다. 시스템 프롬프트를 직접 고쳐가며 결과를 비교할 수 있습니다.",
    href: "/dev/persona",
    tag: "텍스트",
    icon: UserRoundSearch,
  },
  {
    title: "10년 뒤 사진 생성",
    description:
      "DB에서 학생을 고르면 저장된 사진을 입력으로 10년 뒤 모습을 만듭니다. 프롬프트를 고쳐가며 결과를 비교할 수 있습니다.",
    href: "/dev/future-photo",
    tag: "이미지",
    icon: ImageIcon,
  },
]

export default function DevIndexPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <Badge variant="secondary" className="mb-3">
          dev
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">개발 도구</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          로컬 codex CLI로 동작하는 테스트 화면입니다. OpenRouter 크레딧을 쓰지 않으며,
          로컬(APP_ENV=local)에서만 열립니다.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {DEV_TOOLS.map((tool) => (
          <ToolCard key={tool.href} tool={tool} />
        ))}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: DevTool }) {
  const { title, description, href, tag, icon: Icon } = tool
  return (
    <Link href={href} className="block">
      <Card className="h-full cursor-pointer transition hover:border-primary/50 hover:shadow-md">
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
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            열기 <ArrowRight className="size-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
