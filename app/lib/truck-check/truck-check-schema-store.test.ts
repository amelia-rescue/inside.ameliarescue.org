import { describe, it, expect } from "vitest";
import {
  TruckCheckSchemaStore,
  TruckNotFound,
  SchemaNotFound,
  type Truck,
  type TruckCheckSchema,
} from "./truck-check-schema-store";

describe("truck check schema store test", () => {
  describe("Truck operations", () => {
    it("should be able to create and get a truck", async () => {
      const store = TruckCheckSchemaStore.make();
      const truckId = `truck-${crypto.randomUUID()}`;

      const truck: Truck = {
        truckId,
        displayName: "Medic 1",
        schemaId: "schema-123",
      };

      const created = await store.createTruck(truck);
      expect(created).toEqual(truck);

      const retrieved = await store.getTruck(truckId);
      expect(retrieved).toEqual(truck);
    });

    it("should throw TruckNotFound when getting a non-existent truck", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(store.getTruck("nonexistent")).rejects.toBeInstanceOf(
        TruckNotFound,
      );
    });

    it("should be able to update a truck", async () => {
      const store = TruckCheckSchemaStore.make();
      const truckId = `truck-${crypto.randomUUID()}`;

      const truck: Truck = {
        truckId,
        displayName: "Medic 1",
        schemaId: "schema-123",
      };

      await store.createTruck(truck);

      const updated = await store.updateTruck({
        ...truck,
        displayName: "Medic 1 - Updated",
      });

      expect(updated.displayName).toBe("Medic 1 - Updated");

      const retrieved = await store.getTruck(truckId);
      expect(retrieved.displayName).toBe("Medic 1 - Updated");
    });

    it("should throw TruckNotFound when updating a non-existent truck", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(
        store.updateTruck({
          truckId: "nonexistent",
          displayName: "Test",
          schemaId: "schema-1",
        }),
      ).rejects.toBeInstanceOf(TruckNotFound);
    });

    it("should be able to delete a truck", async () => {
      const store = TruckCheckSchemaStore.make();
      const truckId = `truck-${crypto.randomUUID()}`;

      const truck: Truck = {
        truckId,
        displayName: "Medic 1",
        schemaId: "schema-123",
      };

      await store.createTruck(truck);
      await store.deleteTruck(truckId);

      await expect(store.getTruck(truckId)).rejects.toBeInstanceOf(
        TruckNotFound,
      );
    });

    it("should throw TruckNotFound when deleting a non-existent truck", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(store.deleteTruck("nonexistent")).rejects.toBeInstanceOf(
        TruckNotFound,
      );
    });

    it("should be able to list all trucks", async () => {
      const store = TruckCheckSchemaStore.make();
      const testId = crypto.randomUUID();

      const trucks: Truck[] = [
        {
          truckId: `truck-${testId}-1`,
          displayName: "Medic 1",
          schemaId: "schema-1",
        },
        {
          truckId: `truck-${testId}-2`,
          displayName: "Medic 2",
          schemaId: "schema-1",
        },
        {
          truckId: `truck-${testId}-3`,
          displayName: "QRV 1",
          schemaId: "schema-2",
        },
      ];

      await Promise.all(trucks.map((truck) => store.createTruck(truck)));

      const allTrucks = await store.listTrucks();
      expect(allTrucks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Schema operations", () => {
    it("should be able to create and get a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const schema = await store.createSchema({
        version: 1,
        title: "ALS Truck Check v1",
        sections: [
          {
            id: "section-1",
            title: "Engine Compartment",
            fields: [
              {
                type: "checkbox",
                label: "Oil level checked",
                required: true,
              },
            ],
          },
        ],
      });

      expect(schema).toMatchObject({
        schemaId: expect.any(String),
        version: 1,
        title: "ALS Truck Check v1",
        createdAt: expect.any(String),
      });

      const retrieved = await store.getSchema(schema.schemaId);
      expect(retrieved).toEqual(schema);
    });

    it("should throw SchemaNotFound when getting a non-existent schema", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(store.getSchema("nonexistent")).rejects.toBeInstanceOf(
        SchemaNotFound,
      );
    });

    it("should be able to update a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const schema = await store.createSchema({
        version: 1,
        title: "ALS Truck Check v1",
        sections: [],
      });

      const updated = await store.updateSchema({
        ...schema,
        title: "ALS Truck Check v1 - Updated",
        sections: [
          {
            id: "section-1",
            title: "New Section",
            fields: [],
          },
        ],
      });

      expect(updated.title).toBe("ALS Truck Check v1 - Updated");
      expect(updated.sections.length).toBe(1);

      const retrieved = await store.getSchema(schema.schemaId);
      expect(retrieved.title).toBe("ALS Truck Check v1 - Updated");
    });

    it("should throw SchemaNotFound when updating a non-existent schema", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(
        store.updateSchema({
          schemaId: "nonexistent",
          version: 1,
          title: "Test",
          sections: [],
        }),
      ).rejects.toBeInstanceOf(SchemaNotFound);
    });

    it("should be able to delete a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const schema = await store.createSchema({
        version: 1,
        title: "ALS Truck Check v1",
        sections: [],
      });

      await store.deleteSchema(schema.schemaId);

      await expect(store.getSchema(schema.schemaId)).rejects.toBeInstanceOf(
        SchemaNotFound,
      );
    });

    it("should throw SchemaNotFound when deleting a non-existent schema", async () => {
      const store = TruckCheckSchemaStore.make();

      await expect(store.deleteSchema("nonexistent")).rejects.toBeInstanceOf(
        SchemaNotFound,
      );
    });

    it("should be able to list all schemas", async () => {
      const store = TruckCheckSchemaStore.make();

      await store.createSchema({
        version: 1,
        title: "ALS Truck Check v1",
        sections: [],
      });

      await store.createSchema({
        version: 2,
        title: "ALS Truck Check v2",
        sections: [],
      });

      await store.createSchema({
        version: 1,
        title: "BLS Truck Check v1",
        sections: [],
      });

      const schemas = await store.listSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle schemas with complex field types", async () => {
      const store = TruckCheckSchemaStore.make();

      const schema = await store.createSchema({
        version: 1,
        title: "Comprehensive Truck Check",
        sections: [
          {
            id: "section-1",
            title: "Engine Compartment",
            description: "Check all engine components",
            fields: [
              {
                type: "checkbox",
                label: "Oil level checked",
                required: true,
                helpText: "Check dipstick",
              },
              {
                type: "text",
                label: "Notes",
                placeholder: "Enter any notes",
                maxLength: 500,
              },
              {
                type: "number",
                label: "Tire Pressure (PSI)",
                required: true,
                min: 30,
                max: 50,
                unit: "psi",
              },
              {
                type: "select",
                label: "Fuel Level",
                required: true,
                options: [
                  { value: "full", label: "Full" },
                  { value: "3/4", label: "3/4" },
                  { value: "1/2", label: "1/2" },
                  { value: "1/4", label: "1/4" },
                  { value: "empty", label: "Empty" },
                ],
              },
              {
                type: "photo",
                label: "Damage Photos",
                maxPhotos: 5,
              },
            ],
          },
        ],
      });

      expect(schema.sections[0].fields.length).toBe(5);
      expect(schema.sections[0].fields[0].type).toBe("checkbox");
      expect(schema.sections[0].fields[1].type).toBe("text");
      expect(schema.sections[0].fields[2].type).toBe("number");
      expect(schema.sections[0].fields[3].type).toBe("select");
      expect(schema.sections[0].fields[4].type).toBe("photo");

      const retrieved = await store.getSchema(schema.schemaId);
      expect(retrieved.sections[0].fields).toEqual(schema.sections[0].fields);
    });

    it("should create new version when updating a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const v1 = await store.createSchema({
        version: 1,
        title: "Schema v1",
        sections: [],
      });

      const v2 = await store.updateSchema({
        schemaId: v1.schemaId,
        version: 2,
        title: "Schema v2",
        sections: [],
      });

      expect(v2.schemaId).toBe(v1.schemaId);
      expect(v2.createdAt).not.toBe(v1.createdAt);
      expect(v2.title).toBe("Schema v2");

      const latest = await store.getSchema(v1.schemaId);
      expect(latest.title).toBe("Schema v2");
      expect(latest.createdAt).toBe(v2.createdAt);
    });

    it("should retrieve specific schema version by createdAt", async () => {
      const store = TruckCheckSchemaStore.make();

      const v1 = await store.createSchema({
        version: 1,
        title: "Schema v1",
        sections: [],
      });

      const v2 = await store.updateSchema({
        schemaId: v1.schemaId,
        version: 2,
        title: "Schema v2",
        sections: [],
      });

      const retrievedV1 = await store.getSchemaVersion(
        v1.schemaId,
        v1.createdAt,
      );
      expect(retrievedV1.title).toBe("Schema v1");
      expect(retrievedV1.version).toBe(1);

      const retrievedV2 = await store.getSchemaVersion(
        v2.schemaId,
        v2.createdAt,
      );
      expect(retrievedV2.title).toBe("Schema v2");
      expect(retrievedV2.version).toBe(2);
    });

    it("should list all versions of a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const v1 = await store.createSchema({
        version: 1,
        title: "Schema v1",
        sections: [],
      });

      await store.updateSchema({
        schemaId: v1.schemaId,
        version: 2,
        title: "Schema v2",
        sections: [],
      });

      await store.updateSchema({
        schemaId: v1.schemaId,
        version: 3,
        title: "Schema v3",
        sections: [],
      });

      const versions = await store.listSchemaVersions(v1.schemaId);
      expect(versions.length).toBe(3);
      expect(versions[0].title).toBe("Schema v3");
      expect(versions[1].title).toBe("Schema v2");
      expect(versions[2].title).toBe("Schema v1");
    });

    it("should only delete the latest version when deleting a schema", async () => {
      const store = TruckCheckSchemaStore.make();

      const v1 = await store.createSchema({
        version: 1,
        title: "Schema v1",
        sections: [],
      });

      const v2 = await store.updateSchema({
        schemaId: v1.schemaId,
        version: 2,
        title: "Schema v2",
        sections: [],
      });

      await store.deleteSchema(v1.schemaId);

      const latest = await store.getSchema(v1.schemaId);
      expect(latest.title).toBe("Schema v1");

      const v1Direct = await store.getSchemaVersion(v1.schemaId, v1.createdAt);
      expect(v1Direct.title).toBe("Schema v1");

      await expect(
        store.getSchemaVersion(v2.schemaId, v2.createdAt),
      ).rejects.toBeInstanceOf(SchemaNotFound);
    });
  });
});
