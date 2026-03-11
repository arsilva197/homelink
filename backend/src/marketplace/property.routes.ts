import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { propertyService } from './property.service';
import { authenticate, requireBroker, AuthRequest } from '../common/middleware/auth';
import { PropertyType, ListingType, CommitmentLevel } from '@prisma/client';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10MB, 20 files
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const createPropertySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2).max(2),
  zipcode: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  propertyType: z.nativeEnum(PropertyType),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  sizeM2: z.number().positive(),
  price: z.number().positive(),
  listingType: z.nativeEnum(ListingType).optional(),
  commitmentLevel: z.nativeEnum(CommitmentLevel).optional(),
  brokerId: z.string().uuid().optional(),
  agencyId: z.string().uuid().optional(),
});

// GET /properties
router.get('/', async (req, res: Response, next: NextFunction) => {
  try {
    const filters = {
      city: req.query.city as string,
      state: req.query.state as string,
      propertyType: req.query.propertyType as PropertyType,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      minSize: req.query.minSize ? Number(req.query.minSize) : undefined,
      maxSize: req.query.maxSize ? Number(req.query.maxSize) : undefined,
      bedrooms: req.query.bedrooms ? Number(req.query.bedrooms) : undefined,
      listingType: req.query.listingType as ListingType,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };
    const result = await propertyService.listProperties(filters);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /properties/:id
router.get('/:id', async (req, res: Response, next: NextFunction) => {
  try {
    const property = await propertyService.getProperty(req.params.id);
    res.json({ success: true, data: property });
  } catch (err) { next(err); }
});

// POST /properties
router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createPropertySchema.parse(req.body);
    const property = await propertyService.createProperty({
      ...data,
      ownerId: req.user!.id,
    });
    res.status(201).json({ success: true, data: property });
  } catch (err) { next(err); }
});

// PATCH /properties/:id
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createPropertySchema.partial().parse(req.body);
    const property = await propertyService.updateProperty(req.params.id, req.user!.id, data);
    res.json({ success: true, data: property });
  } catch (err) { next(err); }
});

// DELETE /properties/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const isAdmin = req.user!.roles.some(r => ['ADMIN', 'SUPER_ADMIN'].includes(r));
    await propertyService.deleteProperty(req.params.id, req.user!.id, isAdmin);
    res.json({ success: true, message: 'Property removed' });
  } catch (err) { next(err); }
});

// POST /properties/:id/images
router.post('/:id/images', authenticate, upload.array('images', 20),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files?.length) throw new Error('No files uploaded');
      const images = await propertyService.uploadImages(req.params.id, req.user!.id, files);
      res.status(201).json({ success: true, data: images });
    } catch (err) { next(err); }
  }
);

// POST /properties/import (CSV bulk import)
router.post('/import', authenticate, requireBroker, upload.single('file'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { bulkImportService } = await import('../broker/bulkImport.service');
      const result = await bulkImportService.importCSV(
        req.file!,
        req.user!.id
      );
      res.status(202).json({ success: true, data: result });
    } catch (err) { next(err); }
  }
);

export default router;
