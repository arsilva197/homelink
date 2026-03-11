import { prisma } from '../common/db/prisma';
import { propertyService } from '../marketplace/property.service';
import { logger } from '../common/logger';
import { PropertyType, ListingType } from '@prisma/client';

interface CSVRow {
  address: string;
  city: string;
  state: string;
  price: string;
  property_type: string;
  bedrooms: string;
  size: string;
  zipcode?: string;
  latitude?: string;
  longitude?: string;
  title?: string;
  description?: string;
}

export class BulkImportService {
  async importCSV(file: Express.Multer.File, userId: string) {
    const broker = await prisma.brokerProfile.findUnique({ where: { userId } });
    if (!broker || broker.status !== 'APPROVED') {
      throw new Error('Broker not approved');
    }

    // Create import record
    const importRecord = await prisma.bulkImport.create({
      data: {
        brokerId: broker.id,
        fileName: file.originalname,
        status: 'PROCESSING',
      },
    });

    // Parse CSV
    const rows = this.parseCSV(file.buffer.toString('utf-8'));
    const errors: Array<{ row: number; error: string }> = [];
    let successRows = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await propertyService.createProperty({
          title: row.title || `${row.property_type} in ${row.city}`,
          description: row.description,
          address: row.address,
          city: row.city,
          state: row.state,
          zipcode: row.zipcode || '',
          latitude: Number(row.latitude) || 0,
          longitude: Number(row.longitude) || 0,
          propertyType: this.parsePropertyType(row.property_type),
          bedrooms: row.bedrooms ? Number(row.bedrooms) : undefined,
          sizeM2: Number(row.size),
          price: Number(row.price),
          listingType: ListingType.SALE,
          ownerId: userId,
          brokerId: broker.id,
        });
        successRows++;
      } catch (err) {
        errors.push({ row: i + 2, error: String(err) });
        logger.warn(`CSV import row ${i + 2} failed:`, err);
      }
    }

    await prisma.bulkImport.update({
      where: { id: importRecord.id },
      data: {
        status: errors.length === rows.length ? 'FAILED' : 'COMPLETED',
        totalRows: rows.length,
        successRows,
        errorRows: errors.length,
        errors: errors.length ? errors : undefined,
        completedAt: new Date(),
      },
    });

    return {
      importId: importRecord.id,
      totalRows: rows.length,
      successRows,
      errorRows: errors.length,
      errors: errors.slice(0, 10), // Return first 10 errors
    };
  }

  private parseCSV(csv: string): CSVRow[] {
    const lines = csv.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row as CSVRow);
    }

    return rows;
  }

  private parsePropertyType(type: string): PropertyType {
    const map: Record<string, PropertyType> = {
      apartment: PropertyType.APARTMENT,
      house: PropertyType.HOUSE,
      commercial: PropertyType.COMMERCIAL,
      land: PropertyType.LAND,
      studio: PropertyType.STUDIO,
      penthouse: PropertyType.PENTHOUSE,
      townhouse: PropertyType.TOWNHOUSE,
      farm: PropertyType.FARM,
    };
    return map[type.toLowerCase()] || PropertyType.HOUSE;
  }
}

export const bulkImportService = new BulkImportService();
