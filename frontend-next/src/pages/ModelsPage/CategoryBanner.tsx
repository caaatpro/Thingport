import type { Category } from "@/api/categories";

/** Shown above the grid when the category has a meta title. Nothing without one. */
export function CategoryBanner({ category }: { category: Category }) {
  if (!category.meta_title) return null;
  return (
    <section aria-label="About this category" className="mb-5 rounded-card border border-border bg-accent-soft px-5 py-4">
      <h2 className="text-lg font-semibold tracking-tight text-fg">{category.meta_title}</h2>
      {category.meta_description ? <p className="mt-1 text-sm text-muted">{category.meta_description}</p> : null}
    </section>
  );
}
