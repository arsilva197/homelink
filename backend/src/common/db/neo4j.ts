import neo4j, { Driver, Session, QueryResult } from 'neo4j-driver';
import { logger } from '../logger';

let driver: Driver;

export const neo4jDriver = (() => {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'homelink_neo4j_secret'
      ),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 min
        disableLosslessIntegers: true,
      }
    );
  }
  return driver;
})();

export async function runQuery(
  cypher: string,
  params: Record<string, unknown> = {},
  database = 'neo4j'
): Promise<QueryResult> {
  const session: Session = neo4jDriver.session({ database });
  try {
    const result = await session.run(cypher, params);
    return result;
  } catch (err) {
    logger.error('Neo4j query error:', { cypher, error: err });
    throw err;
  } finally {
    await session.close();
  }
}

export async function initNeo4jSchema(): Promise<void> {
  logger.info('Initializing Neo4j schema...');

  // Create constraints and indexes
  const queries = [
    'CREATE CONSTRAINT property_id IF NOT EXISTS FOR (p:Property) REQUIRE p.id IS UNIQUE',
    'CREATE CONSTRAINT preference_id IF NOT EXISTS FOR (pref:Preference) REQUIRE pref.id IS UNIQUE',
    'CREATE INDEX property_city IF NOT EXISTS FOR (p:Property) ON (p.city)',
    'CREATE INDEX property_type IF NOT EXISTS FOR (p:Property) ON (p.propertyType)',
    'CREATE INDEX property_price IF NOT EXISTS FOR (p:Property) ON (p.price)',
    'CREATE INDEX property_active IF NOT EXISTS FOR (p:Property) ON (p.isActive)',
  ];

  for (const query of queries) {
    try {
      await runQuery(query);
    } catch (err) {
      logger.warn(`Neo4j schema init warning: ${err}`);
    }
  }

  logger.info('✅ Neo4j schema initialized');
}

export default neo4jDriver;
