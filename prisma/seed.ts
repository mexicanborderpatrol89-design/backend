// Seeds the DB with the frontend fixtures (skyro-obedy / skyrojam-student).
// Idempotent: wipes the domain tables first, then recreates them.
// Balances are plain integers on Account — no ledger table.
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";
import "dotenv/config";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

type SeedMeal = {
  name: string;
  desc: string;
  category: "MEAT" | "POULTRY" | "VEGETARIAN" | "FISH" | "SOUP_DESSERT";
  tint: string;
  allergens: string[];
  icon: string;
  capacity: number;
};

const MEALS: SeedMeal[] = [
  { name: "Bryndzové halušky so slaninou", desc: "Zemiakové cesto, ovčia bryndza, opražená slanina", category: "MEAT", tint: "t-peach", allergens: ["1, 7"], icon: "ramen_dining", capacity: 41 },
  { name: "Vyprážaný bravčový rezeň", desc: "Zemiaková kaša, citrón, kyslá uhorka", category: "MEAT", tint: "t-peach", allergens: ["1, 3, 7"], icon: "lunch_dining", capacity: 38 },
  { name: "Kuracie prsia na grile", desc: "Dusená ryža, dusená zelenina, bylinkové maslo", category: "POULTRY", tint: "t-blue", allergens: ["7"], icon: "kebab_dining", capacity: 27 },
  { name: "Šošovicová polievka a pirohy", desc: "Pirohy plnené tvarohom, kyslá smotana", category: "SOUP_DESSERT", tint: "t-cream", allergens: ["1, 3, 7"], icon: "soup_kitchen", capacity: 19 },
  { name: "Zeleninové rizoto", desc: "Arborio ryža, cuketa, hrášok, parmezán", category: "VEGETARIAN", tint: "t-green", allergens: ["veg", "7"], icon: "rice_bowl", capacity: 16 },
  { name: "Segedínsky guláš s knedľou", desc: "Bravčové mäso, kyslá kapusta, parená knedľa", category: "MEAT", tint: "t-peach", allergens: ["1, 3, 7"], icon: "restaurant", capacity: 14 },
  { name: "Treska na masle", desc: "Varené zemiaky s petržlenovou vňaťou", category: "FISH", tint: "t-lilac", allergens: ["4, 7"], icon: "set_meal", capacity: 11 },
  { name: "Cestoviny s bazalkovým pestom", desc: "Paradajky, rukola, píniové oriešky", category: "VEGETARIAN", tint: "t-green", allergens: ["veg", "1, 7, 8"], icon: "dinner_dining", capacity: 10 },
  { name: "Caesar šalát s kuracím mäsom", desc: "Rímsky šalát, krutóny, parmezán, dresing", category: "POULTRY", tint: "t-blue", allergens: ["1, 3, 4, 7"], icon: "local_dining", capacity: 8 },
];

const SEED_PASSWORD = "cajkovskeho48";
const SEED_PASSWORD_HASH = await hashPassword(SEED_PASSWORD);

const utcDay = (day: number) => new Date(Date.UTC(2026, 8, day));

async function main() {
  // Wipe in dependency order.
  await prisma.announcement.deleteMany();
  await prisma.order.deleteMany();
  await prisma.mealOnDay.deleteMany();
  await prisma.schoolDay.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.account.deleteMany();

  const manager = await prisma.account.create({
    data: {
      role: "MANAGER",
      name: "Vedúca jedálne",
      username: "prengac",
      passwordHash: SEED_PASSWORD_HASH,
    },
  });

  const students = [
    { id: "s1", name: "Matej Hrušovský", username: "matej.hrusovsky", classCode: "3.A", balance: 4750 },
    { id: "s2", name: "Nina Bartošová", username: "nina.bartosova", classCode: "3.A", balance: 11200 },
    { id: "s3", name: "Tomáš Ondrejka", username: "tomas.ondrejka", classCode: "2.B", balance: 550 },
    { id: "s4", name: "Adam Šimko", username: "adam.simko", classCode: "2.B", balance: 200 },
    { id: "s5", name: "Zuzana Kráľová", username: "zuzana.kralova", classCode: "1.A", balance: 8850 },
    { id: "s6", name: "Lenka Michalcová", username: "lenka.michalcova", classCode: "1.A", balance: 0 },
    { id: "s7", name: "Peter Kollár", username: "peter.kollar", classCode: "4.A", balance: 3300 },
    { id: "s8", name: "Sofia Danišová", username: "sofia.danisova", classCode: "4.A", balance: 6100, active: false },
  ];

  for (const s of students) {
    await prisma.account.create({
      data: {
        id: s.id,
        role: "STUDENT",
        name: s.name,
        username: s.username,
        classCode: s.classCode,
        active: s.active ?? true,
        balanceCents: s.balance,
        passwordHash: SEED_PASSWORD_HASH,
      },
    });
  }

  // Meals.
  const mealIds: string[] = [];
  for (const m of MEALS) {
    const created = await prisma.meal.create({
      data: {
        name: m.name,
        desc: m.desc,
        category: m.category,
        allergens: m.allergens,
        icon: m.icon,
        tint: m.tint,
      },
    });
    mealIds.push(created.id);
  }

  // School days Mon 14 – Fri 18 Sep 2026, full 9-slot menu each day.
  const mealOnDayIds = new Map<string, string>();
  for (let i = 0; i < 5; i++) {
    const date = utcDay(14 + i);
    const key = date.toISOString().slice(0, 10);
    await prisma.schoolDay.create({ data: { mealDate: date } });
    for (let slot = 1; slot <= 9; slot++) {
      const mod = await prisma.mealOnDay.create({
        data: { mealDate: date, slot, mealId: mealIds[slot - 1], capacity: MEALS[slot - 1].capacity, orderCount: 0 },
      });
      mealOnDayIds.set(`${key}|${slot}`, mod.id);
    }
  }

  // Previous week (7–11 Sep) — extra days for order-history realism.
  for (let i = 0; i < 5; i++) {
    const date = utcDay(7 + i);
    const key = date.toISOString().slice(0, 10);
    await prisma.schoolDay.create({ data: { mealDate: date } });
    for (let slot = 1; slot <= 9; slot++) {
      const mod = await prisma.mealOnDay.create({
        data: { mealDate: date, slot, mealId: mealIds[slot - 1], capacity: MEALS[slot - 1].capacity, orderCount: 0 },
      });
      mealOnDayIds.set(`${key}|${slot}`, mod.id);
    }
  }

  // A few orders for Matej and others — history + this week's picks.
  async function placeOrder(student: string, dayKey: string, slot: number, status: "ORDERED" | "CANCELLED" | "SERVED", at: string) {
    const modId = mealOnDayIds.get(`${dayKey}|${slot}`)!;
    await prisma.order.create({
      data: { studentId: student, mealOnDayId: modId, status, createdAt: new Date(at) },
    });
    if (status !== "CANCELLED") {
      await prisma.mealOnDay.update({ where: { id: modId }, data: { orderCount: { increment: 1 } } });
    }
  }

  // Matej, previous week.
  await placeOrder("s1", "2026-09-09", 9, "SERVED", "2026-09-08T08:10:00Z");
  await placeOrder("s1", "2026-09-10", 8, "CANCELLED", "2026-09-09T08:05:00Z");
  await placeOrder("s1", "2026-09-11", 2, "SERVED", "2026-09-10T08:15:00Z");

  // This week (Mon Obed 1, Tue Obed 3, Wed Obed 5).
  await placeOrder("s1", "2026-09-14", 1, "ORDERED", "2026-09-11T09:02:00Z");
  await placeOrder("s1", "2026-09-15", 3, "ORDERED", "2026-09-12T08:58:00Z");
  await placeOrder("s1", "2026-09-16", 5, "ORDERED", "2026-09-14T07:02:00Z");
  await placeOrder("s7", "2026-09-16", 1, "ORDERED", "2026-09-14T07:40:00Z");
  await placeOrder("s7", "2026-09-16", 3, "ORDERED", "2026-09-14T08:05:00Z");

  // Announcements.
  await prisma.announcement.create({
    data: {
      title: "Uzávierka objednávok sa mení na 14:00",
      body: "Od pondelka 21. septembra sa objednávky na nasledujúci deň uzatvárajú o 14:00 namiesto 15:30. Platí pre všetky ročníky.",
      important: true,
      authorId: manager.id,
      createdAt: new Date("2026-09-14T07:12:00Z"),
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Tri nové vegetariánske jedlá od októbra",
      body: "Do ponuky pribudnú tri bezmäsité jedlá. Hlasovanie o štvrtom nájdete v školskom Classroome do piatka.",
      authorId: manager.id,
      createdAt: new Date("2026-09-13T13:40:00Z"),
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Výdaj obedov počas testovania",
      body: "V utorok 15. septembra sa vydáva až od 12:20 kvôli celoškolskému testovaniu v telocvični.",
      authorId: manager.id,
      createdAt: new Date("2026-09-11T10:05:00Z"),
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Jesenné prázdniny bez výdaja",
      body: "Od 28. do 31. októbra sa obedy nevydávajú. Objednávky na tieto dni sa zrušia automaticky.",
      authorId: manager.id,
      createdAt: new Date("2026-09-08T07:22:00Z"),
    },
  });

  console.log(
    "Seeded. Account count:",
    await prisma.account.count(),
    "MealOnDay:",
    await prisma.mealOnDay.count(),
    "Orders:",
    await prisma.order.count(),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());