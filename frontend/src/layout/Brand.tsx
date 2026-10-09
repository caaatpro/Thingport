import { useTheme } from "@/app/theme";
import { cn } from "@/ui";
import lockupColor from "@/assets/logos/thingport-lockup-compact-color.svg";
import lockupOnDark from "@/assets/logos/thingport-lockup-compact-on-dark.svg";
import markColor from "@/assets/logos/thingport-mark-color.svg";
import markOnDark from "@/assets/logos/thingport-mark-on-dark.svg";

type Props = {
  className?: string;
  /** Only when the image is the whole content (no link or text around it). */ alt?: string;
};

/** The icon alone, for the collapsed sidebar. Decorative: put the accessible name on the link around it. */
export function BrandMark({ className, alt = "" }: Props) {
  const { resolved } = useTheme();
  return (
    <img src={resolved === "dark" ? markOnDark : markColor} alt={alt} className={cn("block h-7 w-auto", className)} />
  );
}

/** Icon plus name. Decorative: put the accessible name on the link around it. */
export function Wordmark({ className, alt = "" }: Props) {
  const { resolved } = useTheme();
  return (
    <img
      src={resolved === "dark" ? lockupOnDark : lockupColor}
      alt={alt}
      className={cn("block h-8 w-auto", className)}
    />
  );
}
