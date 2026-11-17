import type { MobileBot } from "./api";

/** Value equality for the data a bot record carries: primitives, arrays and plain objects. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return (
      keys.length === Object.keys(rightRecord).length &&
      keys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

export function retainUnchangedBotRoster(current: MobileBot[], next: MobileBot[]): MobileBot[] {
  // The RPC returns full Bot records, including arrays and nested settings omitted from
  // MobileBot. Compare every field by value while preserving roster and array order.
  const unchanged =
    current.length === next.length &&
    current.every((bot, index) => {
      const candidate = next[index]!;
      const keys = Object.keys(bot) as Array<keyof MobileBot>;
      return (
        keys.length === Object.keys(candidate).length &&
        keys.every((key) => Object.hasOwn(candidate, key) && sameValue(bot[key], candidate[key]))
      );
    });
  return unchanged ? current : next;
}
