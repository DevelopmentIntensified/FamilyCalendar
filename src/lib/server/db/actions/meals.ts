import { db } from '$lib/server/db';
import { meals, type Meal } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

export function isMealKind(value: string): value is MealKind {
	return (MEAL_KINDS as readonly string[]).includes(value);
}

const MEAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A day key in 'YYYY-MM-DD' (the dashboard's zone-decided day label). */
export function isMealDate(value: string): boolean {
	return MEAL_DATE_RE.test(value);
}

export async function getMealsByDate(familyId: string, date: string): Promise<Meal[]> {
	return await db
		.select()
		.from(meals)
		.where(and(eq(meals.familyId, familyId), eq(meals.date, date)))
		.orderBy(meals.createdAt);
}

/** Insert a meal row. Validates kind + date key + non-blank label;
 *  returns null instead of writing garbage. */
export async function addMeal(data: {
	familyId: string;
	date: string;
	kind: string;
	label: string;
	createdBy: string;
}): Promise<Meal | null> {
	if (!isMealKind(data.kind) || !isMealDate(data.date)) return null;
	const label = data.label.trim();
	if (!label) return null;
	const [created] = await db
		.insert(meals)
		.values({
			familyId: data.familyId,
			date: data.date,
			kind: data.kind,
			label,
			createdBy: data.createdBy
		})
		.returning();
	return created;
}

/** Delete a meal, scoped to the caller's family so members can only
 *  remove their own family's rows. */
export async function deleteMeal(id: string, familyId: string): Promise<boolean> {
	const removed = await db
		.delete(meals)
		.where(and(eq(meals.id, id), eq(meals.familyId, familyId)))
		.returning({ id: meals.id });
	return removed.length > 0;
}