import { db } from '$lib/server/db';
import { families, type Family } from '$lib/server/db/schema';
import { count, eq } from 'drizzle-orm';

export async function getFamiliesCount() {
  return await db.select({ count: count() }).from(families)
}

export async function getFamilies() {
  return await db.select().from(families).orderBy(families.createdAt);
}

export async function getFamily(id: number) {
  const [familiesItem] = await db.select().from(families).where(eq(families.id, id));
  return familiesItem;
}

export async function createFamily(data: Omit<Family, 'id' | 'createdAt'>) {
  const [createdFamilies] = await db.insert(families).values(data).returning();
  return createdFamilies;
}

export async function updateFamilies(id: number, data: Partial<Omit<Family, 'id' | 'createdAt'>>) {
  const [updatedFamilies] = await db.update(families).set(data).where(eq(families.id, id)).returning();
  return updatedFamilies;
}

export async function deleteFamilies(id: number) {
  await db.delete(families).where(eq(families.id, id));
}

