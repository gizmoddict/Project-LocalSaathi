/**
 * Base entity interface with standard timestamp audit trail and UUID identifier.
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/**
 * Standard geospatial coordinate representation.
 * Compliant with PostGIS Point(longitude, latitude).
 */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Hyperlocal location details.
 */
export interface Address {
  street?: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  coordinates: GeoPoint;
}

/**
 * Generic pagination request query.
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Standard pagination metadata.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Standard paginated response envelope.
 */
export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}
