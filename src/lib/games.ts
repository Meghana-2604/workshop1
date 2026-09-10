import { and, asc, count, eq, inArray, type SQL } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number;
}

export interface GamePagination {
    page: number;
    limit: number;
}

export interface PaginatedGames {
    games: Game[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function gameFilterCondition(filters: GameFilters): SQL | undefined {
    const conditions = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }

    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    return and(...conditions);
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Returns games ordered by title, optionally filtered by category and publisher.
 *
 * @param db Injectable database client used to query games.
 * @param filters Optional category and publisher constraints. Multiple categories
 * are matched with OR semantics and publisher filtering is combined with them.
 * @returns Games matching all supplied constraints, ordered alphabetically.
 */
export async function getAllGames(
    db: Database,
    filters: GameFilters = {},
): Promise<Game[]> {
    const rows = await baseGamesQuery(db)
        .where(gameFilterCondition(filters))
        .orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Returns one stable, alphabetically ordered page of games and its collection
 * metadata while applying the same category and publisher filters as
 * {@link getAllGames}.
 *
 * @param db Injectable database client used to query games.
 * @param pagination One-based page number and positive page size.
 * @param filters Optional category and publisher constraints.
 * @returns The requested page, normalized pagination values, total matching
 * games, and total page count.
 */
export async function getPaginatedGames(
    db: Database,
    pagination: GamePagination,
    filters: GameFilters = {},
): Promise<PaginatedGames> {
    const page = Math.max(1, Math.floor(pagination.page));
    const limit = Math.max(1, Math.floor(pagination.limit));
    const condition = gameFilterCondition(filters);
    const [{ total }] = await db
        .select({ total: count(games.id) })
        .from(games)
        .where(condition);
    const totalPages = Math.ceil(total / limit);
    const rows = await baseGamesQuery(db)
        .where(condition)
        .orderBy(asc(games.title))
        .limit(limit)
        .offset((page - 1) * limit);

    return {
        games: rows.map(mapGame),
        page,
        limit,
        total,
        totalPages,
    };
}

/**
 * Returns all game ids ordered by title.
 *
 * @param db Injectable database client used to query game ids.
 * @returns All game ids in stable alphabetical title order.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Returns a single game by id.
 *
 * @param db Injectable database client used to query the game.
 * @param id Game id to look up.
 * @returns The matching game, or null when it does not exist.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
