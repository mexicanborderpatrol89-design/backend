import type { MealCategory, OrderStatus } from "../generated/prisma/client";
import { eur } from "./pricing";

const CATEGORY_LABEL: Record<MealCategory, string> = {
  MEAT: "Mäsité",
  POULTRY: "Hydina",
  VEGETARIAN: "Vegetariánske",
  FISH: "Ryba",
  SOUP_DESSERT: "Polievka a múčnik",
};

export function categoryLabel(c: MealCategory) {
  return CATEGORY_LABEL[c];
}

const DAY_SHORT = ["", "Po", "Ut", "St", "Št", "Pi", "So", "Ne"] as const;
export function dayShort(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay();
  return DAY_SHORT[dow] ?? "";
}

const MONTH_GEN = [
  "januára",
  "februára",
  "marca",
  "apríla",
  "mája",
  "júna",
  "júla",
  "augusta",
  "septembra",
  "októbra",
  "novembra",
  "decembra",
];

/** "14. septembra 2026" */
export function dateLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCDate()}. ${MONTH_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Pondelok 14. septembra 2026" — full label for one day. */
export function dayNameLabel(date: Date): string {
  const names = [
    "Nedeľa",
    "Pondelok",
    "Utorok",
    "Streda",
    "Štvrtok",
    "Piatok",
    "Sobota",
  ];
  return `${names[date.getUTCDay()]} ${dateLabel(date.toISOString().slice(0, 10))}`;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "dnes 9:02" / "11. sep 8:40" — close to the fixture subtitles. */
export function smartTimeLabels(now: Date, at: Date): string {
  const hours = String(at.getUTCHours()).padStart(2, "0");
  const min = pad2(at.getUTCMinutes());
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return `dnes ${hours}:${min}`;
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days === 1) return `včera ${hours}:${min}`;
  return `${dateLabel(at.toISOString().slice(0, 10))} ${hours}:${min}`;
}

type Chip = { st: "ok" | "warn" | "bad" | "open"; l: string };

export const STATUS_CHIP: Record<OrderStatus, Chip> = {
  OPEN: { st: "open", l: "Otvorené" },
  ORDERED: { st: "ok", l: "Objednané" },
  CHANGED: { st: "warn", l: "Zmenené" },
  CANCELLED: { st: "bad", l: "Zrušené" },
  AUTO_CANCELLED: { st: "bad", l: "Zrušené" },
  SERVED: { st: "ok", l: "Vydané" },
};

export { eur };