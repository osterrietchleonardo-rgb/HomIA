import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  kicker: string;
  title: string;
  description?: string;
  dark?: boolean;
  align?: "center" | "left";
}

export function SectionHeading({
  kicker,
  title,
  description,
  dark = false,
  align = "center",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" ? "mx-auto text-center" : "text-left"
      )}
    >
      <p
        className={cn(
          "text-xs font-bold uppercase tracking-[0.2em]",
          dark ? "text-ai" : "text-tech"
        )}
      >
        {kicker}
      </p>
      <h2
        className={cn(
          "mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]",
          dark ? "text-white" : "text-navy"
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-4 text-pretty text-base leading-relaxed sm:text-lg",
            dark ? "text-white/60" : "text-navy/60"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
