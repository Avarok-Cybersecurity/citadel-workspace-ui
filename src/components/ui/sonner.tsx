import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Toasts, positioned so they do not sit on top of the button you were about to
 * press.
 *
 * At 375px the "Ready to work offline" toast occupied 559-651px and the join
 * form's submit button 572-607px: `document.elementFromPoint` at the centre of
 * "Join" returned the toast. The last button of first-run registration was not
 * clickable while an ambient notice was on screen, and nothing failed -- the
 * button was present, visible, enabled and named, and a tap landed on the
 * notice.
 *
 * Bottom-right is fine on a desktop, where a toast lands in empty margin. On a
 * phone there is no margin: the toast spans the width and the primary action is
 * at the bottom of the form. So on small viewports they come from the top.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobile()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
