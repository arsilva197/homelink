import { PrismaClient, UserRole, PropertyType, ListingType, CommitmentLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Homelink database...');

  // Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@homelink.com' },
    update: {},
    create: {
      email: 'admin@homelink.com',
      password: await bcrypt.hash('Admin@1234!', 12),
      firstName: 'Super',
      lastName: 'Admin',
      roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      isEmailVerified: true,
    },
  });
  console.log(`✅ Admin: ${superAdmin.email}`);

  // Sample broker
  const brokerUser = await prisma.user.upsert({
    where: { email: 'broker@homelink.com' },
    update: {},
    create: {
      email: 'broker@homelink.com',
      password: await bcrypt.hash('Broker@1234!', 12),
      firstName: 'Carlos',
      lastName: 'Andrade',
      roles: [UserRole.BROKER],
      isEmailVerified: true,
    },
  });

  await prisma.brokerProfile.upsert({
    where: { userId: brokerUser.id },
    update: {},
    create: {
      userId: brokerUser.id,
      creciNumber: 'SP-123456',
      creciState: 'SP',
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: superAdmin.id,
      bio: 'Especialista em imóveis residenciais em São Paulo.',
      regions: ['São Paulo', 'Campinas'],
    },
  });
  console.log(`✅ Broker: ${brokerUser.email}`);

  // Sample owners with properties
  const owners = [
    { email: 'rodrigo@example.com', firstName: 'Rodrigo', lastName: 'Mendes' },
    { email: 'carla@example.com', firstName: 'Carla', lastName: 'Ferreira' },
    { email: 'bruno@example.com', firstName: 'Bruno', lastName: 'Tavares' },
    { email: 'ana@example.com', firstName: 'Ana', lastName: 'Silva' },
  ];

  const properties = [
    {
      title: 'Apartamento 3 Quartos – Pinheiros',
      address: 'Rua dos Pinheiros, 123', city: 'São Paulo', state: 'SP',
      zipcode: '05422-010', latitude: -23.5667, longitude: -46.6833,
      propertyType: PropertyType.APARTMENT, bedrooms: 3, bathrooms: 2,
      sizeM2: 95, price: 920000, commitmentLevel: CommitmentLevel.SERIOUS,
    },
    {
      title: 'Casa 4 Quartos – Perdizes',
      address: 'Rua Cardoso de Almeida, 456', city: 'São Paulo', state: 'SP',
      zipcode: '05013-010', latitude: -23.5333, longitude: -46.6667,
      propertyType: PropertyType.HOUSE, bedrooms: 4, bathrooms: 3,
      sizeM2: 200, price: 1150000, commitmentLevel: CommitmentLevel.READY_TO_CLOSE,
    },
    {
      title: 'Studio – Vila Madalena',
      address: 'Rua Aspicuelta, 89', city: 'São Paulo', state: 'SP',
      zipcode: '05433-010', latitude: -23.5601, longitude: -46.6879,
      propertyType: PropertyType.STUDIO, bedrooms: 1, bathrooms: 1,
      sizeM2: 45, price: 480000, commitmentLevel: CommitmentLevel.SERIOUS,
    },
    {
      title: 'Cobertura Duplex – Moema',
      address: 'Alameda dos Arapanés, 1200', city: 'São Paulo', state: 'SP',
      zipcode: '04524-001', latitude: -23.6010, longitude: -46.6710,
      propertyType: PropertyType.PENTHOUSE, bedrooms: 3, bathrooms: 4,
      sizeM2: 180, price: 2100000, commitmentLevel: CommitmentLevel.EXPLORING,
    },
  ];

  for (let i = 0; i < owners.length; i++) {
    const owner = await prisma.user.upsert({
      where: { email: owners[i].email },
      update: {},
      create: {
        email: owners[i].email,
        password: await bcrypt.hash('User@1234!', 12),
        firstName: owners[i].firstName,
        lastName: owners[i].lastName,
        roles: [UserRole.USER_OWNER],
        isEmailVerified: true,
      },
    });

    const propData = properties[i];
    const property = await prisma.property.create({
      data: {
        ...propData,
        listingType: ListingType.SALE,
        ownerId: owner.id,
      },
    });

    // Add buying preference that creates graph edges
    const nextProp = properties[(i + 1) % properties.length];
    await prisma.buyingPreference.create({
      data: {
        userId: owner.id,
        preferredCity: nextProp.city,
        preferredState: nextProp.state,
        propertyType: nextProp.propertyType,
        minPrice: nextProp.price * 0.8,
        maxPrice: nextProp.price * 1.2,
        minBedrooms: nextProp.bedrooms ? nextProp.bedrooms - 1 : undefined,
        isActive: true,
      },
    });

    console.log(`✅ Owner: ${owner.email} → Property: ${property.title}`);
  }

  console.log('\n🏠 Homelink seeded successfully!');
  console.log('───────────────────────────────');
  console.log('Admin:  admin@homelink.com / Admin@1234!');
  console.log('Broker: broker@homelink.com / Broker@1234!');
  console.log('Users:  rodrigo/carla/bruno/ana @example.com / User@1234!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
