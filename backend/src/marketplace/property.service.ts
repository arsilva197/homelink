import { prisma } from '../common/db/prisma';
import { cache } from '../common/db/redis';
import { runQuery } from '../common/db/neo4j';
import { AppError, NotFoundError } from '../common/middleware/errorHandler';
import { PropertyType, ListingType, CommitmentLevel, Prisma } from '@prisma/client';
import { logger } from '../common/logger';
import { storageService } from '../common/utils/storage';

interface CreatePropertyDto {
  title: string;
  description?: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  latitude: number;
  longitude: number;
  propertyType: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  sizeM2: number;
  price: number;
  listingType?: ListingType;
  commitmentLevel?: CommitmentLevel;
  ownerId: string;
  brokerId?: string;
  agencyId?: string;
}

interface PropertyFilters {
  city?: string;
  state?: string;
  propertyType?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  minSize?: number;
  maxSize?: number;
  bedrooms?: number;
  listingType?: ListingType;
  page?: number;
  limit?: number;
}

export class PropertyService {
  async createProperty(data: CreatePropertyDto) {
    const property = await prisma.property.create({
      data: {
        title: data.title,
        description: data.description,
        address: data.address,
        city: data.city,
        state: data.state,
        zipcode: data.zipcode,
        latitude: data.latitude,
        longitude: data.longitude,
        propertyType: data.propertyType,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        sizeM2: data.sizeM2,
        price: data.price,
        listingType: data.listingType || ListingType.SALE,
        commitmentLevel: data.commitmentLevel || CommitmentLevel.EXPLORING,
        ownerId: data.ownerId,
        representation: data.brokerId || data.agencyId ? {
          create: {
            ownerId: data.ownerId,
            brokerId: data.brokerId,
            agencyId: data.agencyId,
            representationType: data.agencyId ? 'AGENCY_LISTING' :
              data.brokerId ? 'BROKER_LISTING' : 'OWNER_DIRECT',
          },
        } : undefined,
      },
      include: { images: true, representation: true },
    });

    // Sync to Neo4j
    await this.syncPropertyToNeo4j(property);

    // Invalidate heatmap cache for this region
    await cache.invalidatePattern(`heatmap:${data.city}:*`);

    return property;
  }

  async updateProperty(id: string, userId: string, data: Partial<CreatePropertyDto>) {
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Property');
    if (existing.ownerId !== userId) throw new AppError('Not property owner', 403, 'FORBIDDEN');

    const updated = await prisma.property.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: { images: true, representation: true },
    });

    await this.syncPropertyToNeo4j(updated);
    await cache.del(`property:${id}`);

    return updated;
  }

  async getProperty(id: string) {
    const cached = await cache.get<unknown>(`property:${id}`);
    if (cached) return cached;

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        representation: {
          include: {
            broker: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
            agency: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, phone: true } },
      },
    });

    if (!property) throw new NotFoundError('Property');

    // Increment view count asynchronously
    prisma.property.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    await cache.set(`property:${id}`, property, 300); // 5min cache
    return property;
  }

  async listProperties(filters: PropertyFilters) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PropertyWhereInput = {
      isActive: true,
      ...(filters.city && { city: { contains: filters.city, mode: 'insensitive' } }),
      ...(filters.state && { state: filters.state }),
      ...(filters.propertyType && { propertyType: filters.propertyType }),
      ...(filters.listingType && { listingType: filters.listingType }),
      ...(filters.bedrooms && { bedrooms: { gte: filters.bedrooms } }),
      ...((filters.minPrice || filters.maxPrice) && {
        price: {
          ...(filters.minPrice && { gte: filters.minPrice }),
          ...(filters.maxPrice && { lte: filters.maxPrice }),
        },
      }),
      ...((filters.minSize || filters.maxSize) && {
        sizeM2: {
          ...(filters.minSize && { gte: filters.minSize }),
          ...(filters.maxSize && { lte: filters.maxSize }),
        },
      }),
    };

    const [total, properties] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        include: {
          images: { take: 1, orderBy: { displayOrder: 'asc' } },
          owner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: properties,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async uploadImages(propertyId: string, userId: string, files: Express.Multer.File[]) {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundError('Property');
    if (property.ownerId !== userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const existingCount = await prisma.propertyImage.count({ where: { propertyId } });
    if (existingCount + files.length > 20) {
      throw new AppError('Maximum 20 images per property', 400, 'TOO_MANY_IMAGES');
    }

    const uploadPromises = files.map(async (file, index) => {
      const url = await storageService.uploadImage(file, `properties/${propertyId}`);
      return { propertyId, imageUrl: url, displayOrder: existingCount + index };
    });

    const imageData = await Promise.all(uploadPromises);

    await prisma.propertyImage.createMany({ data: imageData });

    return prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async deleteProperty(id: string, userId: string, isAdmin = false) {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundError('Property');
    if (!isAdmin && property.ownerId !== userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    // Soft delete
    await prisma.property.update({ where: { id }, data: { isActive: false } });

    // Remove from Neo4j
    await runQuery('MATCH (p:Property {id: $id}) DETACH DELETE p', { id });
    await cache.del(`property:${id}`);
  }

  private async syncPropertyToNeo4j(property: {
    id: string; city: string; state: string; propertyType: string;
    price: number; sizeM2: number; bedrooms?: number | null;
    latitude: number; longitude: number; isActive: boolean;
    commitmentLevel: string;
  }) {
    try {
      const result = await runQuery(
        `MERGE (p:Property {id: $id})
         SET p.city = $city,
             p.state = $state,
             p.propertyType = $propertyType,
             p.price = $price,
             p.sizeM2 = $sizeM2,
             p.bedrooms = $bedrooms,
             p.latitude = $latitude,
             p.longitude = $longitude,
             p.isActive = $isActive,
             p.commitmentLevel = $commitmentLevel,
             p.updatedAt = datetime()
         RETURN p.id as id`,
        {
          id: property.id,
          city: property.city,
          state: property.state,
          propertyType: property.propertyType,
          price: property.price,
          sizeM2: property.sizeM2,
          bedrooms: property.bedrooms ?? 0,
          latitude: property.latitude,
          longitude: property.longitude,
          isActive: property.isActive,
          commitmentLevel: property.commitmentLevel,
        }
      );
      // Store neo4j node id back in postgres
      if (result.records.length > 0) {
        await prisma.property.update({
          where: { id: property.id },
          data: { neo4jNodeId: result.records[0].get('id') },
        });
      }
    } catch (err) {
      logger.error(`Failed to sync property ${property.id} to Neo4j:`, err);
    }
  }
}

export const propertyService = new PropertyService();
