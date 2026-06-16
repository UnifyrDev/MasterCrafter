import type { MapGeometryPointDto } from "@shared/contracts";

export function calculatePolygonCentroid(points: MapGeometryPointDto[]): MapGeometryPointDto | null {
  if (points.length < 3) {
    return null;
  }

  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-8) {
    return averagePoint(points);
  }

  return {
    x: centroidX / (3 * twiceArea),
    y: centroidY / (3 * twiceArea),
  };
}

export function averagePoint(points: MapGeometryPointDto[]): MapGeometryPointDto | null {
  if (!points.length) {
    return null;
  }

  const totals = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
}

export function calculatePolygonBounds(points: MapGeometryPointDto[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function isPointInPolygon(point: MapGeometryPointDto, polygon: MapGeometryPointDto[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y + Number.EPSILON) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getPolygonLabelPoint(points: MapGeometryPointDto[]): MapGeometryPointDto | null {
  if (points.length < 3) {
    return averagePoint(points);
  }

  const centroid = calculatePolygonCentroid(points);
  if (centroid && isPointInPolygon(centroid, points)) {
    return centroid;
  }

  const bounds = calculatePolygonBounds(points);
  if (!bounds) {
    return centroid;
  }

  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  if (isPointInPolygon(center, points)) {
    return center;
  }

  let bestPoint: MapGeometryPointDto | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const samples = 10;
  const targetX = center.x;
  const targetY = center.y;
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;

  for (let xStep = 0; xStep <= samples; xStep += 1) {
    for (let yStep = 0; yStep <= samples; yStep += 1) {
      const candidate = {
        x: bounds.minX + (width * xStep) / samples,
        y: bounds.minY + (height * yStep) / samples,
      };

      if (!isPointInPolygon(candidate, points)) {
        continue;
      }

      const distance = (candidate.x - targetX) ** 2 + (candidate.y - targetY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = candidate;
      }
    }
  }

  return bestPoint ?? centroid ?? averagePoint(points);
}
