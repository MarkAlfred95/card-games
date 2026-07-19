import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { motion } from "framer-motion";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type {
	CollisionDetection,
	DragEndEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import type { Card as CardModel } from "../../../game/types";
import type { CSSVars } from "../../../styleVars";
import CardSmall from "../../CardSmall";
import { meldTypeOf } from "../../../game/tongits";
import { playSfx } from "../../../sfx";

const CARD_W = "clamp(2.4rem, 6.5vw, 4.5rem)";
// Droppable id for the row itself: dropping past the cards appends to the end.
const END_ID = "hand-end";

// Prefer the card under the pointer over the row container beneath it.
const collisionDetection: CollisionDetection = (args) => {
	const within = pointerWithin(args);
	const onCard = within.find((c) => String(c.id) !== END_ID);
	if (onCard) return [onCard];
	if (within.length) return within;
	return rectIntersection(args);
};

interface Group {
	cards: CardModel[];
	isMeld: boolean;
}

// Segment the display order into contiguous groups (reference layout): each
// maximal run of neighbouring cards that forms a valid meld becomes its own
// group, rendered with a gap around it; loose cards in between cluster into
// one overlapped stretch. Groups follow the DISPLAY order, so dragging cards
// next to each other is what forms (or breaks) a visual group.
function segment(cards: CardModel[]): Group[] {
	const groups: Group[] = [];
	let loose: CardModel[] = [];
	let i = 0;
	while (i < cards.length) {
		let end = -1;
		for (let j = cards.length; j >= i + 3; j--) {
			if (meldTypeOf(cards.slice(i, j))) {
				end = j;
				break;
			}
		}
		if (end > 0) {
			if (loose.length) {
				groups.push({ cards: loose, isMeld: false });
				loose = [];
			}
			groups.push({ cards: cards.slice(i, end), isMeld: true });
			i = end;
		} else {
			loose.push(cards[i]);
			i++;
		}
	}
	if (loose.length) groups.push({ cards: loose, isMeld: false });
	return groups;
}

interface Item {
	card: CardModel;
	idx: number; // overall index, for z-order and the deal stagger
	groupStart: boolean; // first card of a group after the first → gap
	// The ids of the card's meld group, when it sits inside one — double-
	// clicking any card of a complete group plays that whole group.
	meldIds: string[] | null;
}

function FanCard({
	item,
	selected,
	canDrag,
	suppressClick,
	onToggle,
	onPlayMeld,
}: {
	item: Item;
	selected: boolean;
	canDrag: boolean;
	suppressClick: MutableRefObject<boolean>;
	onToggle: (id: string) => void;
	onPlayMeld?: (meldIds?: string[]) => void;
}) {
	const { card, idx, groupStart, meldIds } = item;
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		isDragging,
	} = useDraggable({ id: card.id, disabled: !canDrag });
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: card.id,
		disabled: !canDrag,
	});
	const setRef = (node: HTMLElement | null) => {
		setDragRef(node);
		setDropRef(node);
	};

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -40, scale: 0.6 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{
				delay: 0.02 * idx,
				type: "spring",
				stiffness: 260,
				damping: 22,
			}}
			style={{
				marginLeft:
					idx === 0
						? 0
						: groupStart
							? "calc(var(--card-w) * 0.18)"
							: "calc(var(--card-w) * -0.35)",
				zIndex: idx,
			}}
			className="transition-transform hover:-translate-y-2"
		>
			<div
				ref={setRef}
				{...listeners}
				{...attributes}
				style={{
					touchAction: canDrag ? "none" : undefined,
					opacity: isDragging ? 0.35 : 1,
				}}
				className={`relative outline-none ${
					canDrag ? "cursor-grab active:cursor-grabbing" : ""
				}`}
			>
				{/* Insertion cue while another card hovers over this one */}
				{isOver && !isDragging && (
					<span
					className="absolute -left-1.5 bottom-0 top-0 z-10 w-1 rounded"
					style={{
						background: "var(--hud-accent)",
						boxShadow: "0 0 8px var(--hud-accent)",
					}}
				/>
				)}
				<CardSmall
					rank={card.rank}
					suit={card.suit}
					selected={selected}
					onClick={() => {
						if (suppressClick.current) return;
						onToggle(card.id);
					}}
					onDoubleClick={() => onPlayMeld?.(meldIds ?? undefined)}
					className="cursor-pointer shadow-md"
				/>
			</div>
		</motion.div>
	);
}

function FanRow({
	items,
	selected,
	canDrag,
	suppressClick,
	dealKey,
	onToggle,
	onPlayMeld,
}: {
	items: Item[];
	selected: Set<string>;
	canDrag: boolean;
	suppressClick: MutableRefObject<boolean>;
	dealKey: number;
	onToggle: (id: string) => void;
	onPlayMeld?: (meldIds?: string[]) => void;
}) {
	const { setNodeRef } = useDroppable({ id: END_ID, disabled: !canDrag });
	return (
		<div
			ref={setNodeRef}
			className="flex justify-center px-2 pb-1 pt-3"
			style={{ "--card-w": CARD_W } as CSSVars}
		>
			{items.map((item) => (
				<FanCard
					key={`${dealKey}-${item.card.id}`}
					item={item}
					selected={selected.has(item.card.id)}
					canDrag={canDrag}
					suppressClick={suppressClick}
					onToggle={onToggle}
					onPlayMeld={onPlayMeld}
				/>
			))}
		</div>
	);
}

// The human hand: a big, nearly-flat overlapping row (reference layout) with
// contiguous melds pulled apart into their own groups. Click to select
// (multi-select); double-click a grouped meld to play it (or, on a loose
// card, to play the current selection). When `onReorder` is provided, cards
// can also be dragged into any order — dropping on a card inserts there,
// dropping past the row appends to the end.
export default function HandFan({
	cards,
	selected,
	onToggle,
	onPlayMeld,
	onReorder,
	dealKey,
}: {
	cards: CardModel[];
	selected: Set<string>;
	onToggle: (id: string) => void;
	// Double-click: called with the meld group's ids when the card sits in a
	// complete group, otherwise with no argument (play the selection).
	onPlayMeld?: (meldIds?: string[]) => void;
	// Manual rearrangement: move `activeId` next to `overId` (null = end).
	onReorder?: (activeId: string, overId: string | null) => void;
	dealKey: number;
}) {
	const sensors = useSensors(
		// A small distance threshold keeps plain clicks (select) and
		// double-clicks (meld) working alongside dragging.
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);
	const [activeCard, setActiveCard] = useState<CardModel | null>(null);
	// A click fires right after a drag's pointerup — swallow it so dropping a
	// card doesn't also toggle its selection.
	const suppressClick = useRef(false);
	const canDrag = Boolean(onReorder);

	const items: Item[] = [];
	let idx = 0;
	for (const [gi, g] of segment(cards).entries()) {
		const meldIds = g.isMeld ? g.cards.map((c) => c.id) : null;
		for (const [k, card] of g.cards.entries()) {
			items.push({
				card,
				idx: idx++,
				groupStart: gi > 0 && k === 0,
				meldIds,
			});
		}
	}

	function handleDragStart({ active }: DragStartEvent) {
		suppressClick.current = true;
		setActiveCard(cards.find((c) => c.id === active.id) ?? null);
		playSfx("card_pick");
	}

	function endDrag() {
		setActiveCard(null);
		setTimeout(() => {
			suppressClick.current = false;
		}, 150);
	}

	function handleDragEnd({ active, over }: DragEndEvent) {
		endDrag();
		if (!over || !onReorder) return;
		const activeId = String(active.id);
		const overId = String(over.id);
		if (overId === activeId) return;
		onReorder(activeId, overId === END_ID ? null : overId);
		playSfx("card_swap");
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={endDrag}
		>
			<FanRow
				items={items}
				selected={selected}
				canDrag={canDrag}
				suppressClick={suppressClick}
				dealKey={dealKey}
				onToggle={onToggle}
				onPlayMeld={onPlayMeld}
			/>
			<DragOverlay>
				{activeCard ? (
					<div style={{ "--card-w": CARD_W } as CSSVars}>
						<CardSmall
							rank={activeCard.rank}
							suit={activeCard.suit}
							className="rotate-3 shadow-xl"
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
