import { normalizePolygon, roomToBoard, signedArea, sub, type Vec } from '#lib/core/geometry.ts';
import { isWallElement, type BoardPos, type Point, type RoomElement } from '#lib/core/schema.ts';

export function reframePolygon(
	boardPos: BoardPos,
	polygon: readonly Vec[]
): { polygon: Point[]; boardPos: BoardPos } | undefined {
	const board = polygon.map((p) => roomToBoard({ boardPos }, p));
	const reversed = signedArea(board) < 0;
	const origin = board[0];
	const direction = sub(reversed ? board[board.length - 1] : board[1], origin);
	if (Math.hypot(direction.x, direction.y) < 1) return undefined;
	const rot = Math.round(((Math.atan2(direction.y, direction.x) * 180) / Math.PI) * 100) / 100;
	return {
		polygon: normalizePolygon(board),
		boardPos: { x: Math.round(origin.x), y: Math.round(origin.y), rot: ((rot % 360) + 360) % 360 }
	};
}

export function remapAfterInsert(
	elements: readonly RoomElement[],
	wallNumber: number,
	along: number
): RoomElement[] {
	return elements.map((element) => {
		if (!isWallElement(element)) return element;
		if (element.wall > wallNumber) return { ...element, wall: element.wall + 1 };
		if (element.wall === wallNumber && element.offset >= along) {
			return { ...element, wall: wallNumber + 1, offset: element.offset - along };
		}
		return element;
	});
}

export function remapAfterRemove(
	elements: readonly RoomElement[],
	cornerIndex: number,
	firstWallLength: number
): RoomElement[] {
	return elements.map((element) => {
		if (!isWallElement(element)) return element;
		if (element.wall === cornerIndex + 1) {
			return { ...element, wall: cornerIndex, offset: element.offset + firstWallLength };
		}
		if (element.wall > cornerIndex + 1) return { ...element, wall: element.wall - 1 };
		return element;
	});
}
