import { z } from 'zod';

/**
 * Geocode contract — a thin proxy over OSM Nominatim (see
 * apps/api/src/modules/trajet/geocoding.ts), used by the departure/arrival
 * location picker on the ride-creation form (apps/web).
 */

export const GeocodeSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2),
  })
  .describe('GeocodeSearchQuery');
export type GeocodeSearchQuery = z.infer<typeof GeocodeSearchQuerySchema>;

export const GeocodeResultSchema = z
  .object({
    label: z.string(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .describe('GeocodeResult');
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

export const GeocodeSearchResponseSchema = z
  .object({
    items: z.array(GeocodeResultSchema),
  })
  .describe('GeocodeSearchResponse');
export type GeocodeSearchResponse = z.infer<typeof GeocodeSearchResponseSchema>;

export const GeocodeReverseQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .describe('GeocodeReverseQuery');
export type GeocodeReverseQuery = z.infer<typeof GeocodeReverseQuerySchema>;

export const GeocodeReverseResponseSchema = z
  .object({
    label: z.string().nullable(),
  })
  .describe('GeocodeReverseResponse');
export type GeocodeReverseResponse = z.infer<typeof GeocodeReverseResponseSchema>;
