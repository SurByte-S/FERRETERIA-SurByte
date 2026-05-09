export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6 max-w-4xl">
      <p className="mb-2 text-base font-medium text-muted-foreground">
        Panel principal
      </p>
      <h1 className="text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-lg leading-8 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}
