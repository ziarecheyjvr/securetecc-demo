"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // inline-flex, not the default inline: base-ui renders a <span>, and
        // width/height are ignored on an inline box.
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs outline-none transition-shadow",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
        "data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground",
        "data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon className="size-3.5" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
