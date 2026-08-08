import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-bold transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "button-primary bg-primary px-5 text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-transparent px-5 text-foreground hover:border-foreground/30 hover:bg-muted",
        ghost: "px-3 text-foreground hover:bg-muted",
        inverse: "button-inverse bg-primary-foreground px-5 text-primary hover:bg-primary-foreground/90",
      },
      size: {
        default: "h-11",
        lg: "h-12 px-6 text-[0.95rem]",
        sm: "h-9 px-3 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
