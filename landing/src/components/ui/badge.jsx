import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex min-h-7 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] border px-2.5 text-[0.72rem] font-bold tracking-[0.02em]",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/8 text-primary",
        neutral: "border-border bg-background text-muted-foreground",
        dark: "border-white/15 bg-white/5 text-white/72",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
