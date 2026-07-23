import Link from "next/link"
import { type VariantProps } from "class-variance-authority"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A navigation link that looks like a `Button` and stays a link.
 *
 * Base UI's `Button` assumes the `render` prop produces a real `<button>`; when
 * it renders an anchor it stamps `role="button"` onto it, which removes the link
 * semantics from a control that navigates to a URL. Every place that wanted "a
 * button-shaped link" belongs here instead: `buttonVariants` supplies the look,
 * a `next/link` anchor keeps `role=link`, keyboard behaviour, and the links
 * rotor. For a non-route anchor (a download or an external target) apply
 * `buttonVariants` to a plain `<a>` directly — this component is for routes.
 */
function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { ButtonLink }
