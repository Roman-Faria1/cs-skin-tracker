export function formatPortfolioMoney(value: string | null): string {
  if (value === null) return "Unavailable";
  const [whole, fraction] = value.replace(/^-/, "").split(".");
  return `${value.startsWith("-") ? "-" : ""}$${new Intl.NumberFormat("en-US").format(BigInt(whole!))}.${fraction}`;
}
