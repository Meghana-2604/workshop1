import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getPaginatedGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('filters games by one or more categories and a publisher', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'strategy games' })
            .returning({ id: categories.id });
        const [adventure] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'adventure games' })
            .returning({ id: categories.id });
        const [publisherOne] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'first publisher' })
            .returning({ id: publishers.id });
        const [publisherTwo] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'second publisher' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            {
                title: 'Adventure One',
                description: 'Adventure',
                starRating: 4,
                categoryId: adventure.id,
                publisherId: publisherOne.id,
            },
            {
                title: 'Strategy One',
                description: 'Strategy',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: publisherOne.id,
            },
            {
                title: 'Strategy Two',
                description: 'Strategy',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: publisherTwo.id,
            },
        ]);

        const filtered = await getAllGames(db, {
            categoryIds: [strategy.id, adventure.id],
            publisherId: publisherOne.id,
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Adventure One',
            'Strategy One',
        ]);
    });

    it('returns no games when filters have no matches', async () => {
        await seedGames(db, 2);
        expect(await getAllGames(db, { categoryIds: [99999] })).toEqual([]);
    });

    it('returns a page of games with total metadata', async () => {
        await seedGames(db, 5);

        const result = await getPaginatedGames(db, { page: 2, limit: 2 });

        expect(result.games.map((game) => game.title)).toEqual(['Game 03', 'Game 04']);
        expect(result.total).toBe(5);
        expect(result.totalPages).toBe(3);
        expect(result.page).toBe(2);
        expect(result.limit).toBe(2);
    });

    it('applies filters before calculating pagination metadata', async () => {
        await seedGames(db, 3);
        const [category] = await db.select({ id: categories.id }).from(categories);
        const result = await getPaginatedGames(db, { page: 1, limit: 2 }, {
            categoryIds: [category.id],
        });

        expect(result.games).toHaveLength(2);
        expect(result.total).toBe(3);
        expect(result.totalPages).toBe(2);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
