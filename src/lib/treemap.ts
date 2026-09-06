export interface TreemapDatum {
  key: string;
  value: number;
}

export interface TreemapLayout extends TreemapDatum {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_VALUE = 0.0001;

function getWorstAspectRatio(row: TreemapDatum[], rowValue: number, shortSide: number): number {
  if (row.length === 0 || rowValue <= 0 || shortSide <= 0) return Number.POSITIVE_INFINITY;

  const maxValue = Math.max(...row.map((item) => item.value));
  const minValue = Math.min(...row.map((item) => item.value));
  if (minValue <= 0) return Number.POSITIVE_INFINITY;

  const shortSideSquared = shortSide * shortSide;
  const rowValueSquared = rowValue * rowValue;

  return Math.max(
    (shortSideSquared * maxValue) / rowValueSquared,
    rowValueSquared / (shortSideSquared * minValue),
  );
}

function normalizeData(data: readonly TreemapDatum[]): TreemapDatum[] {
  const values = data.map((item) => (Number.isFinite(item.value) ? Math.max(item.value, 0) : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const smallestPositive = values.filter((value) => value > 0).sort((a, b) => a - b)[0] ?? 1;
  const safeValues = values.map((value) => (value > 0 ? value : Math.min(MIN_VALUE, smallestPositive)));
  const safeTotal = safeValues.reduce((sum, value) => sum + value, 0);

  return data.map((item, index) => ({
    key: item.key,
    value: total > 0 ? safeValues[index] / safeTotal : 1 / data.length,
  }));
}

/**
 * Creates a squarified treemap in normalized (0..1) coordinates.
 * The resulting rectangle areas follow each datum's value, while keeping
 * the tiles reasonably close to square for easier scanning.
 */
export function createTreemapLayout(data: readonly TreemapDatum[]): TreemapLayout[] {
  if (data.length === 0) return [];

  const remaining = normalizeData(data).sort((a, b) => b.value - a.value);
  const layouts: TreemapLayout[] = [];
  let available: Rect = { x: 0, y: 0, width: 1, height: 1 };

  while (remaining.length > 0 && available.width > 0 && available.height > 0) {
    const row: TreemapDatum[] = [];
    let rowValue = 0;
    const shortSide = Math.min(available.width, available.height);

    while (remaining.length > 0) {
      const next = remaining[0];
      const candidateRow = [...row, next];
      const candidateValue = rowValue + next.value;
      const currentWorst = getWorstAspectRatio(row, rowValue, shortSide);
      const candidateWorst = getWorstAspectRatio(candidateRow, candidateValue, shortSide);

      if (row.length === 0 || candidateWorst <= currentWorst) {
        row.push(next);
        rowValue = candidateValue;
        remaining.shift();
      } else {
        break;
      }
    }

    if (row.length === 0) break;

    const isHorizontalRow = available.width >= available.height;
    if (isHorizontalRow) {
      const rowHeight = Math.min(available.height, rowValue / available.width);
      let offset = 0;

      for (const item of row) {
        const itemWidth = rowHeight > 0 ? item.value / rowHeight : 0;
        layouts.push({
          ...item,
          x: available.x + offset,
          y: available.y,
          width: itemWidth,
          height: rowHeight,
        });
        offset += itemWidth;
      }

      available = {
        x: available.x,
        y: available.y + rowHeight,
        width: available.width,
        height: Math.max(0, available.height - rowHeight),
      };
    } else {
      const rowWidth = Math.min(available.width, rowValue / available.height);
      let offset = 0;

      for (const item of row) {
        const itemHeight = rowWidth > 0 ? item.value / rowWidth : 0;
        layouts.push({
          ...item,
          x: available.x,
          y: available.y + offset,
          width: rowWidth,
          height: itemHeight,
        });
        offset += itemHeight;
      }

      available = {
        x: available.x + rowWidth,
        y: available.y,
        width: Math.max(0, available.width - rowWidth),
        height: available.height,
      };
    }
  }

  return layouts;
}
